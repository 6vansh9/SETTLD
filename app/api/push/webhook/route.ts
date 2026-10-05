import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import webpush from "web-push";
import { isCurrencyCode } from "@/lib/money";
import { commentTarget, PUSH_KINDS, pushMessages, type ActivityRecord, type PushContext, type PushMember } from "@/lib/push-messages";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Constant-time compare so the secret can't be guessed byte by byte. */
function secretOk(given: string | null): boolean {
  const want = process.env.PUSH_WEBHOOK_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Database webhook (0009: trigger on activity inserts → pg_net POST with x-webhook-secret).
 * Loads what the message needs with the service role, decides recipients (lib/push-messages.ts),
 * sends Web Push, and deletes subscriptions the push service says are gone (404/410).
 */
export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-webhook-secret"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const admin = createAdminClient();
  if (!publicKey || !privateKey || !admin) return NextResponse.json({ error: "push not configured" }, { status: 500 });

  const payload = (await req.json().catch(() => null)) as { table?: string; record?: ActivityRecord } | null;
  const a = payload?.record;
  if (payload?.table !== "activity" || !a?.group_id || !(PUSH_KINDS as readonly string[]).includes(a.kind)) {
    return NextResponse.json({ skipped: true });
  }

  const [{ data: group }, { data: members }] = await Promise.all([
    admin.from("groups").select("id, name, emoji, base_currency").eq("id", a.group_id).maybeSingle(),
    admin.from("group_members").select("id, user_id, display_name, notify_level, left_at, role").eq("group_id", a.group_id),
  ]);
  if (!group || !members || !isCurrencyCode(group.base_currency)) return NextResponse.json({ skipped: true });

  const ctx: PushContext = { group: { ...group, base_currency: group.base_currency }, members: members as PushMember[] };
  const target =
    a.kind === "expense_created"
      ? { type: "expense" as const, id: a.entity_id }
      : a.kind.startsWith("settlement_")
        ? { type: "settlement" as const, id: a.entity_id }
        : a.kind === "comment_added"
          ? commentTarget(a)
          : null;
  if (target?.id && target.type === "expense") {
    const { data: e } = await admin
      .from("expenses")
      .select("id, title, payers:expense_payers(member_id, amount_base), splits:expense_splits(member_id, amount_base)")
      .eq("id", target.id)
      .maybeSingle();
    if (e) ctx.expense = { id: e.id, title: e.title, payers: e.payers.map((p) => ({ member_id: p.member_id, amount_base: Number(p.amount_base) })), splits: e.splits.map((s) => ({ member_id: s.member_id, amount_base: Number(s.amount_base) })) };
  } else if (target?.id && target.type === "settlement") {
    const { data: s } = await admin.from("settlements").select("id, from_member, to_member, amount_base").eq("id", target.id).maybeSingle();
    if (s) ctx.settlement = { ...s, amount_base: Number(s.amount_base) };
  }

  const messages = pushMessages(a, ctx);
  if (messages.length === 0) return NextResponse.json({ sent: 0 });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", [...new Set(messages.map((m) => m.userId))]);

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://settld-omega.vercel.app", publicKey, privateKey);
  const dead: string[] = [];
  const used: string[] = [];
  const results = await Promise.allSettled(
    (subs ?? []).flatMap((sub) =>
      messages
        .filter((m) => m.userId === sub.user_id)
        .map(async (m) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }),
              { TTL: 60 * 60 * 24, urgency: a.kind === "nudge_sent" || a.kind.startsWith("settlement_") ? "high" : "normal" },
            );
            used.push(sub.id);
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) dead.push(sub.id);
            else console.warn("[push] send failed", status ?? (err as Error).message);
            throw err;
          }
        }),
    ),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  if (used.length) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", used);

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ sent, removed: dead.length, failed: results.length - sent - dead.length });
}

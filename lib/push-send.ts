import webpush from "web-push";
import { isCurrencyCode } from "@/lib/money";
import { commentTarget, pushMessages, type ActivityRecord, type PushContext, type PushMember } from "@/lib/push-messages";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export interface DeliveryResult {
  recipients: number;
  devices: number;
  sent: number;
  removed: number;
  failed: number;
  skipped?: string;
}

const short = (id: string) => id.slice(0, 8);

/**
 * Send the Web Push for one activity row: load what the text needs (service role), decide who
 * gets what (lib/push-messages), send with web-push, delete subscriptions the push service says
 * are gone (404/410). Used by the database webhook and, for nudges, by /api/push/nudge right after
 * the sender's tap. Every outcome is logged with a "[push]" prefix (Vercel › Logs, search "[push]").
 *
 * Nudges are claimed first (nudges.pushed_at, 0015) so the two paths never send the same nudge
 * twice; without that column (0015 not run) both may send, and the shared tag makes the phone
 * show it once.
 */
export async function deliverActivityPush(admin: Admin, a: ActivityRecord, via: "webhook" | "direct"): Promise<DeliveryResult> {
  const done = (r: DeliveryResult) => {
    console.info(`[push] ${a.kind} ${short(a.entity_id ?? a.id)} via ${via}`, r);
    return r;
  };
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error("[push] VAPID keys missing on the server");
    return done({ recipients: 0, devices: 0, sent: 0, removed: 0, failed: 0, skipped: "push not configured" });
  }

  if (a.kind === "nudge_sent" && a.entity_id) {
    const { data, error } = await admin.from("nudges").update({ pushed_at: new Date().toISOString() }).eq("id", a.entity_id).is("pushed_at", null).select("id");
    if (error) console.warn("[push] nudge claim unavailable (run 0015); sending anyway", error.code ?? error.message);
    else if (!data?.length) return done({ recipients: 0, devices: 0, sent: 0, removed: 0, failed: 0, skipped: "already sent" });
  }

  const [{ data: group }, { data: members }] = await Promise.all([
    admin.from("groups").select("id, name, emoji, base_currency").eq("id", a.group_id).maybeSingle(),
    admin.from("group_members").select("id, user_id, display_name, notify_level, left_at, role").eq("group_id", a.group_id),
  ]);
  if (!group || !members || !isCurrencyCode(group.base_currency)) return done({ recipients: 0, devices: 0, sent: 0, removed: 0, failed: 0, skipped: "group not found" });

  const ctx: PushContext = { group: { ...group, base_currency: group.base_currency }, members: members as PushMember[] };
  const target =
    a.kind.startsWith("expense_")
      ? { type: "expense" as const, id: a.entity_id }
      : a.kind.startsWith("settlement_")
        ? { type: "settlement" as const, id: a.entity_id }
        : a.kind === "comment_added"
          ? commentTarget(a)
          : null;
  if (target?.id && target.type === "expense") {
    const { data: e } = await admin
      .from("expenses")
      .select("id, title, amount_base, payers:expense_payers(member_id, amount_base), splits:expense_splits(member_id, amount_base)")
      .eq("id", target.id)
      .maybeSingle();
    if (e)
      ctx.expense = {
        id: e.id,
        title: e.title,
        amount_base: Number(e.amount_base),
        payers: e.payers.map((p) => ({ member_id: p.member_id, amount_base: Number(p.amount_base) })),
        splits: e.splits.map((s) => ({ member_id: s.member_id, amount_base: Number(s.amount_base) })),
      };
  } else if (target?.id && target.type === "settlement") {
    const { data: s } = await admin.from("settlements").select("id, from_member, to_member, amount_base").eq("id", target.id).maybeSingle();
    if (s) ctx.settlement = { ...s, amount_base: Number(s.amount_base) };
  }

  const messages = pushMessages(a, ctx);
  if (messages.length === 0) return done({ recipients: 0, devices: 0, sent: 0, removed: 0, failed: 0, skipped: "no recipients (actor only, ghost, left, or notifications off for this group)" });

  const userIds = [...new Set(messages.map((m) => m.userId))];
  const { data: subs } = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
  if (!subs?.length) return done({ recipients: userIds.length, devices: 0, sent: 0, removed: 0, failed: 0, skipped: `no devices registered for ${userIds.map(short).join(", ")}` });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || SITE_URL, publicKey, privateKey);
  const dead: string[] = [];
  const used: string[] = [];
  let failed = 0;
  await Promise.all(
    subs.flatMap((sub) =>
      messages
        .filter((m) => m.userId === sub.user_id)
        .map(async (m) => {
          const host = new URL(sub.endpoint).host;
          try {
            const res = await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }),
              // high: delivered right away even when the phone is idle (iOS/Android may delay "normal")
              { TTL: 60 * 60 * 24, urgency: "high" },
            );
            used.push(sub.id);
            console.info(`[push] ok ${a.kind} → user ${short(m.userId)} at ${host}: ${res.statusCode}`);
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              dead.push(sub.id);
              console.info(`[push] gone ${a.kind} → user ${short(m.userId)} at ${host}: ${status}, subscription removed`);
            } else {
              failed++;
              const body = String((err as { body?: unknown }).body ?? (err as Error).message ?? "").slice(0, 200);
              console.error(`[push] error ${a.kind} → user ${short(m.userId)} at ${host}: ${status ?? "no status"} ${body}`);
            }
          }
        }),
    ),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  if (used.length) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", used);
  return done({ recipients: userIds.length, devices: subs.length, sent: used.length, removed: dead.length, failed });
}

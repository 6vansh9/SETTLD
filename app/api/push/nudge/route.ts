import { NextResponse } from "next/server";
import { deliverActivityPush } from "@/lib/push-send";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The sender's phone calls this right after send_nudge succeeds, so a nudge's push never depends
 * on the database → pg_net → webhook hop. Only the nudge's sender can trigger it (checked with
 * their own session and RLS), only for a recent nudge, and nudges.pushed_at makes sure the
 * webhook and this route never both send it.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { nudgeId?: unknown } | null;
  const nudgeId = typeof body?.nudgeId === "string" && /^[0-9a-f-]{36}$/i.test(body.nudgeId) ? body.nudgeId : null;
  if (!nudgeId) return NextResponse.json({ error: "Bad nudge" }, { status: 400 });

  // RLS: only members of the nudge's group can read it.
  const { data: nudge } = await supabase.from("nudges").select("*").eq("id", nudgeId).maybeSingle();
  if (!nudge) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: sender } = await supabase.from("group_members").select("user_id").eq("id", nudge.from_member).maybeSingle();
  if (sender?.user_id !== user.id) return NextResponse.json({ error: "Not your nudge" }, { status: 403 });
  if (Date.now() - Date.parse(nudge.sent_at) > 10 * 60_000) return NextResponse.json({ error: "Too old" }, { status: 410 });

  const admin = createAdminClient();
  if (!admin) {
    console.error("[push] nudge: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "push not configured" }, { status: 500 });
  }
  const { data: activity } = await admin
    .from("activity")
    .select("id, group_id, actor_member, kind, entity_id, payload")
    .eq("kind", "nudge_sent")
    .eq("entity_id", nudgeId)
    .maybeSingle();
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await deliverActivityPush(admin, { ...activity, payload: (activity.payload ?? {}) as Record<string, unknown> }, "direct");
  // The sender only learns whether it went out, not anything about the receiver's devices.
  return NextResponse.json({ delivered: result.sent > 0 || result.skipped === "already sent" });
}

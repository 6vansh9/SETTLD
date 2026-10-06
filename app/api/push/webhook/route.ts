import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { PUSH_KINDS, type ActivityRecord } from "@/lib/push-messages";
import { deliverActivityPush } from "@/lib/push-send";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Constant-time compare so the secret can't be guessed byte by byte. */
function secretOk(given: string | null): boolean {
  const want = process.env.PUSH_WEBHOOK_SECRET;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Database webhook: the activity insert trigger (0009 → 0015) posts here through pg_net with
 * x-webhook-secret. Delivery itself is lib/push-send.ts (logs every outcome as "[push] …").
 */
export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-webhook-secret"))) {
    console.warn("[push] webhook refused: wrong or missing x-webhook-secret (PUSH_WEBHOOK_SECRET must match private.app_settings)");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    console.error("[push] webhook: SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "push not configured" }, { status: 500 });
  }
  const payload = (await req.json().catch(() => null)) as { table?: string; record?: ActivityRecord } | null;
  const a = payload?.record;
  if (payload?.table !== "activity" || !a?.group_id || !(PUSH_KINDS as readonly string[]).includes(a.kind)) {
    return NextResponse.json({ skipped: true });
  }
  return NextResponse.json(await deliverActivityPush(admin, a, "webhook"));
}

import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Send test notification" on /me: a push to the signed-in user's own devices only, through the
 * same web-push path as real notifications. Reports how many devices are registered and why a
 * send failed, so push can be checked on any phone.
 */
export async function POST() {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const admin = createAdminClient();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!admin || !publicKey || !privateKey) return NextResponse.json({ error: "push not configured" }, { status: 500 });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || SITE_URL, publicKey, privateKey);
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id);
  let sent = 0;
  const dead: string[] = [];
  const failures: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: "Settld · Test", body: "Notifications work on this phone. 🎉", url: "/me", tag: `test-${Date.now()}` }),
          { TTL: 600, urgency: "high" },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else failures.push(String(status ?? (err as Error).message).slice(0, 80));
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  const devices = (subs ?? []).length - dead.length;
  console.info("[push] test", { devices, sent, removed: dead.length, failures });
  return NextResponse.json({ sent, devices, removed: dead.length, failures }, { status: sent ? 200 : devices || failures.length ? 502 : 404 });
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerServiceWorker } from "@/lib/push-client";
import { useProfile } from "@/lib/queries/profile";

/**
 * Signed-in app shell: registers the push-only service worker, re-saves an existing subscription
 * (so a server-side cleanup heals itself), and opens the screen a tapped notification points at.
 * Never asks for permission (that only happens from a tap).
 */
export function PushBridge() {
  const router = useRouter();
  const { data: profile } = useProfile();

  useEffect(() => {
    if (!profile || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    let alive = true;
    void (async () => {
      const reg = await registerServiceWorker();
      if (!alive || !reg || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const sub = await reg.pushManager?.getSubscription();
      const json = sub?.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
      if (json?.endpoint && json.keys?.p256dh && json.keys.auth) {
        await createClient().rpc("save_push_subscription", { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth, p_user_agent: navigator.userAgent });
      }
    })();
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null;
      if (d?.type === "settld-open" && typeof d.url === "string" && d.url.startsWith("/")) router.push(d.url);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [profile, router]);

  return null;
}

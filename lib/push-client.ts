"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Browser side of Web Push. Permission is only ever requested from a tap (enablePush), never on
 * load. On iPhone, push exists only for the Home Screen app (iOS 16.4+), so in Safari we explain
 * Add to Home Screen instead.
 */
export type PushSupport = "supported" | "ios-needs-home-screen" | "unsupported";
export type PushState = "on" | "off" | "denied";

export const PUSH_ASKED_KEY = "settld-push-asked";
/** The full-screen "Turn on notifications" step was answered (on, not now, or denied) on this device. */
export const PUSH_STEP_DONE_KEY = "settld-push-step-done";

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const apis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIOS() && !isStandalone()) return "ios-needs-home-screen";
  return apis && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? "supported" : "unsupported";
}

/** Register the push-only service worker (no caching). Safe to call on every app start. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("[push] service worker registration failed", e);
    return null;
  }
}

function keyBytes(base64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await registerServiceWorker());
}

export async function pushState(): Promise<PushState> {
  if (pushSupport() !== "supported") return "off";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Must be called from a tap. Asks permission, subscribes, saves the endpoint for this user. */
export async function enablePush(): Promise<PushState> {
  try {
    localStorage.setItem(PUSH_ASKED_KEY, "1");
  } catch {
    // storage unavailable: we may ask again later, that's fine
  }
  // First thing in the tap handler: Safari only shows the prompt for a user gesture.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) throw new Error("This browser can't receive notifications.");
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("Couldn't set up notifications.");
  const { error } = await createClient().rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
  return "on";
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await createClient().rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

export function alreadyAsked(): boolean {
  try {
    return localStorage.getItem(PUSH_ASKED_KEY) === "1";
  } catch {
    return true; // can't remember → don't nag
  }
}

"use client";

/**
 * Are we actually online? navigator.onLine only knows whether there's *a* network; on flaky wifi
 * (and after some reloads) it says true while nothing gets through. So we also probe our own
 * /api/version (never cached by the service worker) on open, on focus, on online/offline events,
 * and on a timer (often while offline, to notice recovery quickly).
 */
let reachable = true;
const listeners = new Set<() => void>();
let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;

function set(v: boolean) {
  if (v === reachable) return;
  reachable = v;
  listeners.forEach((l) => l());
}

export async function probe(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    set(false);
    return false;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch("/api/version", { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    set(res.ok);
  } catch {
    set(false);
  }
  return reachable;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    await probe();
    schedule();
  }, reachable ? 60_000 : 8_000);
}

export function startConnectivity() {
  if (started || typeof window === "undefined") return;
  started = true;
  const kick = () => void probe().then(schedule);
  window.addEventListener("online", kick);
  window.addEventListener("offline", () => set(false));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && kick());
  kick();
}

export const isReachable = () => reachable;
export function subscribeConnectivity(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

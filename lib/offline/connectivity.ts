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

let fails = 0;

/**
 * One failed check isn't "offline": a cold serverless start can take longer than the timeout,
 * and showing "Offline" to someone who is online is worse than noticing a real outage 3 s later.
 * So: offline at once only when the browser itself says so; otherwise after two failures in a row.
 */
export async function probe(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    fails = 2;
    set(false);
    return false;
  }
  let ok = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch("/api/version", { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    ok = res.ok;
  } catch {
    ok = false;
  }
  fails = ok ? 0 : fails + 1;
  if (ok) set(true);
  else if (fails >= 2) set(false);
  return reachable;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    await probe();
    schedule();
  }, !reachable ? 8_000 : fails > 0 ? 3_000 : 60_000);
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

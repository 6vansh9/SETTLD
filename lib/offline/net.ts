import { isReachable } from "./connectivity";

/** Network trouble (offline, DNS, dropped connection) rather than the server saying no. */
export function isNetworkError(err: unknown): boolean {
  if (isOffline()) return true;
  const msg = typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|the internet connection appears to be offline|fetch failed/i.test(msg);
}

/** Offline as far as we can tell (no network, or our probe can't reach the app). */
export function isOffline(): boolean {
  return (typeof navigator !== "undefined" && navigator.onLine === false) || !isReachable();
}

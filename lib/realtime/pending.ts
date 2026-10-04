/**
 * My own in-flight writes (PRD › Realtime › Deduplication). Each optimistic write registers its
 * client_id (and/or the row id it touches); realtime events for those keys are ignored because the
 * mutation itself puts the server row into the cache. Keys linger for a short grace period after
 * the RPC settles, because the realtime echo can arrive after the RPC response.
 */
export const PENDING_GRACE_MS = 5000;

export function createPendingRegistry(now: () => number = Date.now) {
  const pending = new Map<string, number>(); // key → expiry (Infinity while in flight)
  const sweep = () => {
    const t = now();
    for (const [k, exp] of pending) if (exp <= t) pending.delete(k);
  };
  return {
    start(...keys: (string | null | undefined)[]) {
      for (const k of keys) if (k) pending.set(k, Number.POSITIVE_INFINITY);
    },
    finish(...keys: (string | null | undefined)[]) {
      const exp = now() + PENDING_GRACE_MS;
      for (const k of keys) if (k) pending.set(k, exp);
    },
    has(...keys: (string | null | undefined)[]) {
      sweep();
      return keys.some((k) => !!k && pending.has(k));
    },
    size() {
      sweep();
      return pending.size;
    },
  };
}

/** The app-wide registry (one per browser tab). */
export const pendingWrites = createPendingRegistry();

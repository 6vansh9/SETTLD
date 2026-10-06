/**
 * Old code after a deploy: the page asks for a JS chunk that no longer exists. Reloading picks up
 * the new build. We reload at most once per 30 s so a real outage can't loop.
 */
export const CHUNK_RELOAD_KEY = "settld-chunk-reload";
const WINDOW_MS = 30_000;

export function isChunkError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? String(error ?? "")}`;
  return /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text);
}

/**
 * The connection dropped while a screen was loading (Safari: "Load failed", or through the service
 * worker "FetchEvent.respondWith received an error: TypeError: Load failed"; Chrome: "Failed to
 * fetch"; Firefox: "NetworkError…"). Not a bug in the screen: retry, or say we're offline.
 */
export function isConnectionError(error: unknown): boolean {
  if (isChunkError(error)) return false;
  const e = error as { name?: string; message?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? String(error ?? "")}`;
  return /load failed|failed to fetch|networkerror|network request failed|network connection was lost|internet connection appears to be offline|respondwith received an error|fetch failed/i.test(text);
}

/** Reload once (per 30 s). Returns false if we already tried, so the caller shows the error. */
export function reloadOnce(now: number = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    if (now - last < WINDOW_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    // No storage (private mode on very old Safari): still reload once per page load.
    const w = window as Window & { __settldReloaded?: boolean };
    if (w.__settldReloaded) return false;
    w.__settldReloaded = true;
  }
  window.location.reload();
  return true;
}

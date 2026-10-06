/// <reference lib="webworker" />
/**
 * Settld service worker (built by @serwist/next into public/sw.js).
 *
 *  • Precache: the app shell (Next static chunks, CSS, self-hosted fonts, icons, /~offline).
 *  • Runtime: app pages and their RSC payloads are network-first (fresh when online, the last
 *    viewed version offline, so groups you opened before still show). Redirected responses
 *    (e.g. a signed-out bounce to /login) are never cached.
 *  • Never cached: /auth/*, /login, /signup, /api/*, and everything from Supabase except public
 *    photos. No tokens or API JSON ever land in the SW cache (Supabase data is shown offline only
 *    through the cached pages, i.e. what the app already rendered).
 *  • Not even intercepted: Supabase calls and /api/* fetches go straight to the network, so a
 *    dropped connection fails the normal way (Safari wraps failures inside a worker as
 *    "FetchEvent.respondWith received an error", which slipped past offline handling).
 *  • Push (Milestone 8): notifications and taps, unchanged.
 *  • Updates: a new worker waits; the app shows "New version · Reload" and sends SKIP_WAITING.
 */
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

export const PAGE_CACHE = "settld-pages";
export const RSC_CACHE = "settld-rsc";
export const PHOTO_CACHE = "settld-photos";

const APP_ROUTE = /^\/($|groups|g\/|activity|me|room\/)/;
const NEVER = /^\/(auth\/|api\/|login|signup|onboarding|join\/|debug\/)/;
const noRedirects = { cacheWillUpdate: async ({ response }: { response: Response }) => (response.status === 200 && !response.redirected ? response : null) };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Page loads of auth/join/etc.: network only (never cached), with the offline page as fallback.
    // Their fetches (e.g. /api/*) aren't matched at all, so the browser handles them directly.
    { matcher: ({ request, url, sameOrigin }) => sameOrigin && request.mode === "navigate" && NEVER.test(url.pathname), handler: new NetworkOnly() },
    // Supabase public photos: fine to keep.
    {
      matcher: ({ url }) => url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/"),
      handler: new CacheFirst({ cacheName: PHOTO_CACHE, plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 86400 })] }),
    },
    // Everything else from Supabase (auth, REST, RPC): not matched, so never cached or intercepted.
    // RSC payloads for app routes (client-side navigation).
    {
      matcher: ({ request, url, sameOrigin }) => sameOrigin && APP_ROUTE.test(url.pathname) && (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")),
      handler: new NetworkFirst({ cacheName: RSC_CACHE, networkTimeoutSeconds: 4, plugins: [noRedirects, new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 14 * 86400 })] }),
    },
    // Full page loads of app routes.
    {
      matcher: ({ request, url, sameOrigin }) => sameOrigin && request.mode === "navigate" && APP_ROUTE.test(url.pathname),
      handler: new NetworkFirst({ cacheName: PAGE_CACHE, networkTimeoutSeconds: 4, plugins: [noRedirects, new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 14 * 86400 })] }),
    },
    // Icons and other public files.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith("/brand/") || url.pathname === "/favicon.ico"),
      handler: new CacheFirst({ cacheName: "settld-static", plugins: [new ExpirationPlugin({ maxEntries: 60 })] }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();

// The app's "Reload" on the update toast.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// ------------------------------------------------------------------------------------------------
// Web Push (Milestone 8)
// ------------------------------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let d: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "Settld", {
      body: d.body || "",
      tag: d.tag || undefined,
      // renotify is valid when a tag is set; not in every lib.dom version
      ...({ renotify: !!d.tag } as object),
      icon: "/brand/icon-192.png",
      badge: "/brand/badge-96.png",
      data: { url: d.url || "/groups" },
    }),
  );
});

// Tap → the right screen: reuse an open Settld window (it navigates itself), else open one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path: string = event.notification.data?.url || "/groups";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin)) {
          w.postMessage({ type: "settld-open", url: path });
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

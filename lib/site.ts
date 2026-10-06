/**
 * The public address of Settld. Used wherever the address is written out for other people:
 * metadata and Open Graph URLs, invite and Split Room links (share text, QR codes), the push
 * VAPID subject fallback. NOT for auth redirects: those use the current request/page origin, so
 * sign-in works on localhost and preview deployments too.
 * NEXT_PUBLIC_SITE_URL overrides it (e.g. a fork, or a custom domain later).
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://settld00.vercel.app").replace(/\/$/, "");

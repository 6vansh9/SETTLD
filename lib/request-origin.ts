/**
 * The public origin of a request (e.g. https://settld-omega.vercel.app), never a configured URL.
 * Prefers Vercel's x-forwarded-host/proto (what the user's browser actually used), validated so a
 * spoofed header can't turn into an open redirect, then falls back to the request URL itself.
 */
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

export function requestOrigin(headers: Pick<Headers, "get">, requestUrl: string): string {
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (host && HOST.test(host) && (proto === "https" || proto === "http")) return `${proto}://${host}`;
  return new URL(requestUrl).origin;
}

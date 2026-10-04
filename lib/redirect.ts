/**
 * Sanitise a post-login redirect target (e.g. an invite link that must survive sign-in).
 * Only same-site absolute paths are allowed; anything else falls back.
 */
export function safeNext(next: string | null | undefined, fallback = "/groups"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}

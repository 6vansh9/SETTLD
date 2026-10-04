/**
 * Sign-in flow helpers shared by the auth routes and the sign-in UI (pure, tested in auth-flow.test.ts).
 */

/** Google always shows the account chooser, so switching accounts never silently reuses the last one. */
export function googleSignInOptions(redirectTo: string) {
  return { redirectTo, queryParams: { prompt: "select_account" } };
}

export type AuthErrorCode = "auth" | "expired" | "denied" | "other-browser" | "code";

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  auth: "Sign-in didn't go through. Try again.",
  expired: "That link expired or was already used. Send a new one.",
  denied: "Sign-in was cancelled.",
  "other-browser":
    "That link was opened in a different browser than the one you signed in from (e.g. the Gmail app). Enter the 6-digit code from the email instead, or open the link in the same browser.",
  code: "That code didn't work. Check it, or send a new one.",
};

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === "string" && value in AUTH_ERROR_MESSAGES;
}

/**
 * Why a callback failed. Supabase reports problems as ?error=…&error_code=…&error_description=…
 * on the redirect; the code exchange can also fail (most often: the PKCE verifier cookie isn't in
 * this browser because the link was opened somewhere else).
 */
export function callbackErrorCode(
  params: URLSearchParams,
  exchangeError?: { code?: string; name?: string; message?: string } | null,
): AuthErrorCode {
  const code = params.get("error_code") ?? "";
  const err = params.get("error") ?? "";
  const description = params.get("error_description") ?? "";
  if (code === "otp_expired" || /expired|invalid or has expired/i.test(description)) return "expired";
  if (err === "access_denied" && !code) return "denied";
  if (code === "flow_state_not_found" || code === "flow_state_expired") return "expired";
  if (exchangeError) {
    if (exchangeError.code === "pkce_code_verifier_not_found" || exchangeError.name === "AuthPKCECodeVerifierMissingError") {
      return "other-browser";
    }
    if (exchangeError.code === "otp_expired" || /expired/i.test(exchangeError.message ?? "")) return "expired";
  }
  return "auth";
}

/** OTP types we accept on token_hash links (email template) — anything else is rejected. */
const OTP_TYPES = ["email", "magiclink", "signup", "invite", "recovery", "email_change"] as const;
export type OtpType = (typeof OTP_TYPES)[number];
export function parseOtpType(value: string | null): OtpType | null {
  return value && (OTP_TYPES as readonly string[]).includes(value) ? (value as OtpType) : null;
}

/** 6–10 digit email OTP (Supabase default length is 6). */
export function normalizeOtp(input: string): string | null {
  const digits = input.replace(/\s/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}

/**
 * Account switching: reset when we knew who was signed in and now it's someone else (or nobody).
 * `undefined` = not known yet (first auth event of the page), which never triggers a reset.
 */
export function shouldResetForUserChange(previous: string | null | undefined, next: string | null): boolean {
  return previous !== undefined && previous !== next;
}

/**
 * Remove this app's data from a Storage (localStorage/sessionStorage). Keeps device preferences
 * listed in `keep` (e.g. the theme). Supabase's own keys ("sb-…") are removed too.
 */
export function clearAppStorage(storage: Pick<Storage, "length" | "key" | "removeItem">, keep: readonly string[] = []): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && !keep.includes(k)) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
  return keys;
}

/**
 * Hard-navigate only when a known account was replaced or signed out. Signing in on a signed-out
 * page (e.g. the email code) clears caches but lets that flow continue to its own destination.
 */
export function shouldNavigateForUserChange(previous: string | null | undefined, next: string | null): boolean {
  return typeof previous === "string" && previous !== next;
}

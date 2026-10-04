import { NextResponse, type NextRequest } from "next/server";
import { callbackErrorCode, parseOtpType } from "@/lib/auth-flow";
import { postSignInPath } from "@/lib/auth-redirect";
import { safeNext } from "@/lib/redirect";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/**
 * Where every sign-in lands (/auth/callback and /auth/confirm). Handles:
 *  • ?code=…        PKCE (Google, default magic-link email). Needs the verifier cookie from the
 *                   browser that started sign-in.
 *  • ?token_hash=…  email template link (works in any browser/app, e.g. the Gmail in-app browser).
 *  • ?error=…       Supabase telling us why it failed (expired link, cancelled, …).
 * Session cookies are written by the server client on this response; the user then continues
 * to onboarding or `next`, both computed from the request's own origin (never a fixed host).
 */
export async function handleAuthReturn(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // The origin the user is actually on (Vercel: x-forwarded-host), never a hard-coded or env URL.
  const origin = requestOrigin(request.headers, request.url);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = parseOtpType(searchParams.get("type"));
  const supabase = createClient();

  let failure: { code?: string; name?: string; message?: string; status?: number } | null = null;
  if (!searchParams.get("error")) {
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(new URL(await postSignInPath(supabase, next), origin));
      failure = error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(await postSignInPath(supabase, next), origin));
      failure = error;
    }
  }

  const reason = callbackErrorCode(searchParams, failure);
  // Shows up in Vercel's function logs; no tokens or emails are logged.
  console.error("[auth] sign-in failed", {
    reason,
    supabaseError: searchParams.get("error_code") ?? searchParams.get("error"),
    exchangeError: failure?.code ?? failure?.name,
    status: failure?.status,
    via: tokenHash ? "token_hash" : code ? "code" : "none",
  });

  const back = new URL("/login", origin);
  back.searchParams.set("error", reason);
  back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}

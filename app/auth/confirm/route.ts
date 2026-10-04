import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { postSignInPath } from "@/lib/auth-redirect";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic links using the token_hash email template land here. Unlike ?code=, this works even
 * when the link is opened in a different browser than the one that requested it
 * (e.g. tapping the link in the Gmail app).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(await postSignInPath(supabase, next), origin));
    }
  }

  const back = new URL("/login", origin);
  back.searchParams.set("error", "link");
  back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}

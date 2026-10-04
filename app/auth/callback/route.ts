import { NextResponse, type NextRequest } from "next/server";
import { postSignInPath } from "@/lib/auth-redirect";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

/** OAuth (Google) and PKCE magic-link return here with ?code=. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(await postSignInPath(supabase, next), origin));
    }
  }

  const back = new URL("/login", origin);
  back.searchParams.set("error", "auth");
  back.searchParams.set("next", next);
  return NextResponse.redirect(back);
}

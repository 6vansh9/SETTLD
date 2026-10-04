import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static files, images, the kit, and /auth/* (the sign-in routes set the
    // session themselves; nothing should touch cookies or redirect before they run).
    "/((?!_next/static|_next/image|favicon.ico|kit|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static files, images, and the kit.
    "/((?!_next/static|_next/image|favicon.ico|kit|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

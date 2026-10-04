import type { NextRequest } from "next/server";
import { handleAuthReturn } from "@/lib/auth-return";

/** Google OAuth and magic links (PKCE ?code= or template ?token_hash=). */
export function GET(request: NextRequest) {
  return handleAuthReturn(request);
}

import type { NextRequest } from "next/server";
import { handleAuthReturn } from "@/lib/auth-return";

/** Older email-template links (?token_hash=&type=) — same handling as /auth/callback. */
export function GET(request: NextRequest) {
  return handleAuthReturn(request);
}

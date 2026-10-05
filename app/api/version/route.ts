import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Which build is live (the app compares it with its own to offer "New version · Reload"). */
export function GET() {
  return NextResponse.json({ sha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}

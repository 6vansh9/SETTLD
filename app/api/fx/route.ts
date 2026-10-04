import { NextResponse, type NextRequest } from "next/server";
import { parsePair } from "@/lib/fx-cache";
import { getRate } from "@/lib/fx";
import { createClient } from "@/lib/supabase/server";

/** GET /api/fx?from=USD&to=INR → { base, quote, rate, fetchedAt, source }. Signed-in users only. */
export async function GET(request: NextRequest) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const pair = parsePair(request.nextUrl.searchParams.get("from"), request.nextUrl.searchParams.get("to"));
  if (!pair) return NextResponse.json({ error: "Unsupported currency pair" }, { status: 400 });

  const quote = await getRate(pair.base, pair.quote);
  if (!quote) {
    return NextResponse.json({ error: "Exchange rate unavailable. Enter the rate manually." }, { status: 503 });
  }
  return NextResponse.json(quote, { headers: { "Cache-Control": "private, max-age=300" } });
}

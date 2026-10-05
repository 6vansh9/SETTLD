import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { ReceiptCard } from "@/lib/og/cards";
import { ogFonts } from "@/lib/og/fonts";
import type { CurrencyCode } from "@/lib/money";
import type { Pastel } from "@/lib/pastels";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Settle-up receipt image. ?size=story (1080×1920) | chat (1200×630, default).
 * Only group members: the caller's session must see the settlement through RLS.
 */
export async function GET(req: NextRequest, { params }: { params: { settlementId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(params.settlementId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await supabase
    .from("settlements")
    .select(
      "amount, currency, created_at, deleted_at, from:group_members!settlements_from_member_fkey(display_name), to:group_members!settlements_to_member_fkey(display_name), group:groups(name, color)",
    )
    .eq("id", params.settlementId)
    .maybeSingle();
  const s = data as unknown as {
    amount: number;
    currency: CurrencyCode;
    created_at: string;
    deleted_at: string | null;
    from: { display_name: string } | null;
    to: { display_name: string } | null;
    group: { name: string; color: Pastel } | null;
  } | null;
  // RLS: non-members simply don't find it.
  if (!s || s.deleted_at || !s.group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const size = req.nextUrl.searchParams.get("size") === "story" ? "story" : "chat";
  const d = new Date(s.created_at);
  const card = {
    from: s.from?.display_name ?? "Someone",
    to: s.to?.display_name ?? "Someone",
    amount: Number(s.amount),
    currency: s.currency,
    groupName: s.group.name,
    color: s.group.color,
    date: `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
  };
  return new ImageResponse(<ReceiptCard data={card} size={size} />, {
    width: size === "story" ? 1080 : 1200,
    height: size === "story" ? 1920 : 630,
    fonts: await ogFonts(),
    headers: { "Cache-Control": "private, max-age=300" },
  });
}

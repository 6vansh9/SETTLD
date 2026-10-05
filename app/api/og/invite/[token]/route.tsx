import { ImageResponse } from "next/og";
import { InviteCard } from "@/lib/og/cards";
import { ogFonts } from "@/lib/og/fonts";
import type { Pastel } from "@/lib/pastels";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 1200×630 invite preview (WhatsApp, iMessage). Public: uses preview_invite only (name, emoji,
 * color, member count). An expired/unknown link still gets a generic Settld card.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  let data = { name: "Join on Settld", emoji: "💸", color: "pink" as Pastel, memberCount: 0 };
  if (/^[A-Za-z0-9_-]{12,64}$/.test(params.token)) {
    const { data: rows } = await createClient().rpc("preview_invite", { p_token: params.token });
    const g = rows?.[0];
    if (g) data = { name: g.name, emoji: g.emoji, color: g.color, memberCount: g.member_count };
  }
  return new ImageResponse(<InviteCard {...data} />, {
    width: 1200,
    height: 630,
    fonts: await ogFonts(),
    emoji: "twemoji",
    headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
  });
}

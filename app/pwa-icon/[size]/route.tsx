import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og/fonts";

export const runtime = "nodejs";

const SIZES: Record<string, { px: number; maskable: boolean }> = {
  "96": { px: 96, maskable: false },
  "180": { px: 180, maskable: false },
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  "maskable-512": { px: 512, maskable: true },
};

/** App icons for the manifest / Home Screen: coral tile, "S" in Anton (bundled font). */
export async function GET(_req: Request, { params }: { params: { size: string } }) {
  const spec = SIZES[params.size];
  if (!spec) return new Response("Not found", { status: 404 });
  const { px, maskable } = spec;
  // Maskable icons keep content inside the 80% safe zone.
  const glyph = Math.round(px * (maskable ? 0.5 : 0.66));
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: "flex", alignItems: "center", justifyContent: "center", background: "#EE6A4B", color: "#0E0E0E" }}>
        <div style={{ fontFamily: "Anton", fontSize: glyph, lineHeight: 1, display: "flex", marginTop: Math.round(px * 0.04) }}>S</div>
      </div>
    ),
    { width: px, height: px, fonts: await ogFonts(), headers: { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" } },
  );
}

import sharp from "sharp";
import { pathFromPublicUrl } from "@/lib/images";

const MAX_BYTES = 3 * 1024 * 1024;

/**
 * A group cover for the OG image: Satori can't decode WebP, so fetch our own stored cover (only
 * from our Supabase bucket) and hand it over as a 1200×630 JPEG data URL. Null on any problem;
 * the card then just uses the plain group color.
 */
export async function coverDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || !pathFromPublicUrl(url, "group-covers")) return null;
  try {
    const ours = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (new URL(url).host !== ours.host) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 600 } });
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    if (input.byteLength > MAX_BYTES) return null;
    const jpeg = await sharp(input).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

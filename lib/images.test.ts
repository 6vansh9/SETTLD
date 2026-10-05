import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { clampCrop, COVER_TINT, cropRect, cropSize, initialCrop, isHeic, panBy, pathFromPublicUrl, publicUrl, zoomTo } from "./images";
import { PASTEL_HEX } from "./pastels";

describe("crop maths", () => {
  it("zoom 1 is the largest crop of the aspect ratio, centred", () => {
    expect(cropRect(4000, 3000, 1, initialCrop(4000, 3000))).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000 });
    expect(cropRect(4000, 3000, 2, initialCrop(4000, 3000))).toEqual({ sx: 0, sy: 500, sw: 4000, sh: 2000 });
    // portrait iPhone photo, wide cover
    expect(cropRect(3024, 4032, 2, initialCrop(3024, 4032))).toEqual({ sx: 0, sy: 1260, sw: 3024, sh: 1512 });
  });

  it("zoom shrinks the crop and is clamped to 1..4", () => {
    expect(cropSize(1000, 1000, 1, 2)).toEqual({ w: 500, h: 500 });
    expect(cropSize(1000, 1000, 1, 10)).toEqual({ w: 250, h: 250 });
    expect(cropSize(1000, 1000, 1, 0.2)).toEqual({ w: 1000, h: 1000 });
  });

  it("the crop never leaves the image", () => {
    const s = clampCrop(1000, 800, 1, { zoom: 2, cx: -50, cy: 5000 });
    const r = cropRect(1000, 800, 1, s);
    expect(r.sx).toBeGreaterThanOrEqual(0);
    expect(r.sy + r.sh).toBeLessThanOrEqual(800);
  });

  it("dragging moves the image with the finger, scaled to source pixels", () => {
    const s = zoomTo(2000, 2000, 1, initialCrop(2000, 2000), 2); // crop 1000px wide
    const moved = panBy(2000, 2000, 1, s, 100, 0, 250); // 100 screen px in a 250px viewport = 400 source px
    expect(moved.cx).toBe(600);
    expect(panBy(2000, 2000, 1, s, -10000, 0, 250).cx).toBe(1500); // clamped at the edge
  });

  it("HEIC detection by type or name", () => {
    expect(isHeic(new Blob([], { type: "image/heic" }))).toBe(true);
    expect(isHeic(Object.assign(new Blob([]), { name: "IMG_0001.HEIC" }))).toBe(true);
    expect(isHeic(new Blob([], { type: "image/jpeg" }))).toBe(false);
  });
});

describe("storage URLs", () => {
  const f = "00000000-0000-0000-0000-00000000000a/11111111-2222-3333-4444-555555555555.webp";
  it("round-trip, and only our bucket's shape is accepted", () => {
    const u = publicUrl("https://x.supabase.co/", "avatars", f);
    expect(u).toBe(`https://x.supabase.co/storage/v1/object/public/avatars/${f}`);
    expect(pathFromPublicUrl(u, "avatars")).toBe(f);
    expect(pathFromPublicUrl(u, "group-covers")).toBeNull();
    expect(pathFromPublicUrl("https://lh3.googleusercontent.com/a/x", "avatars")).toBeNull();
    expect(pathFromPublicUrl(null, "avatars")).toBeNull();
  });
});

describe("cover tint keeps dark text readable on any photo", () => {
  const mix = (hex: string, alpha: number, under: number) =>
    "#" +
    [0, 2, 4]
      .map((i) => Math.round(parseInt(hex.slice(1 + i, 3 + i), 16) * alpha + under * (1 - alpha)))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("");
  for (const [name, hex] of Object.entries(PASTEL_HEX)) {
    it(`${name}: ≥ 4.5:1 over black and over white`, () => {
      expect(contrastRatio("#0E0E0E", mix(hex, COVER_TINT, 0))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#0E0E0E", mix(hex, COVER_TINT, 255))).toBeGreaterThanOrEqual(4.5);
    });
  }
});

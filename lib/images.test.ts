import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { clampCrop, COVER_FADED, COVER_TINT, cropRect, SCRIM_TEXT, SCRIM_TITLE, cropSize, initialCrop, isHeic, panBy, pathFromPublicUrl, publicUrl, zoomTo } from "./images";
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

describe("cover scrim keeps white text AA on any photo", () => {
  // Composite in sRGB like the browser: photo → pastel wash → black scrim → (white text at opacity).
  const over = (top: number[], alpha: number, under: number[]) => top.map((c, i) => c * alpha + under[i] * (1 - alpha));
  const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const photos = { white: [255, 255, 255], black: [0, 0, 0], grey: [128, 128, 128], sky: [135, 206, 235], sand: [238, 214, 175] };
  const WHITE = [255, 255, 255];

  for (const [pastel, ph] of Object.entries(PASTEL_HEX)) {
    for (const [photoName, photo] of Object.entries(photos)) {
      it(`${pastel} over a ${photoName} photo`, () => {
        const washed = over(rgb(ph), COVER_TINT, photo);
        const behindText = over([0, 0, 0], SCRIM_TEXT, washed);
        const behindTitle = over([0, 0, 0], SCRIM_TITLE, washed);
        // white and 60% white labels/amounts: 4.5:1
        expect(contrastRatio("#ffffff", hex(behindText))).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(hex(over(WHITE, COVER_FADED, behindText)), hex(behindText))).toBeGreaterThanOrEqual(4.5);
        // the big name is large text: 3:1
        expect(contrastRatio("#ffffff", hex(behindTitle))).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("the photo keeps its colors: the wash is light", () => {
    expect(COVER_TINT).toBeLessThanOrEqual(0.15);
  });
});

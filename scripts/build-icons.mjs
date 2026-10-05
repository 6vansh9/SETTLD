/**
 * Builds every app icon from public/brand/settld-icon-pixel.svg (the source artwork).
 * Run: node scripts/build-icons.mjs
 *
 *  icon.svg                 clean copy (no embedded metadata) for browser tabs
 *  favicon.ico              16 (no tick stamp or echo: they blur at that size) + 32 + 48, PNG-in-ICO
 *  apple-touch-icon.png     180, FULL-BLEED square (iOS rounds it; transparent corners go black)
 *  icon-192.png, icon-512.png   the rounded artwork as designed ("any")
 *  icon-maskable-512.png    full-bleed, whole artwork scaled into the 80% safe-zone circle
 *  badge-96.png             white S on transparent, for Android notification badges
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const dir = path.join(process.cwd(), "public", "brand");
const src = fs.readFileSync(path.join(dir, "settld-icon-pixel.svg"), "utf8");

const clean = src.replace(/<metadata>[\s\S]*?<\/metadata>/, "").replace(/\s*xmlns:c2pa="[^"]*"/, "");
const fullBleed = (svg) => svg.replace(/(<rect width="1024" height="1024") rx="\d+"/, "$1");
const noStamp = (svg) => svg.replace(/<circle [^>]*\/>/, "").replace(/<polyline [^>]*\/>/, "");
/** 16px: the faded echo just muddies the S at that size. */
const noEcho = (svg) => svg.replace(/<path [^>]*opacity="0\.22"\/>/, "");
/** Keep the background, scale everything drawn on it about the centre. */
const scaled = (svg, k) =>
  svg.replace(/(<rect width="1024" height="1024"[^>]*\/>)([\s\S]*)(<\/svg>)/, (_, bg, art, end) => `${bg}<g transform="translate(512 512) scale(${k}) translate(-512 -512)">${art}</g>${end}`);

// Sanity: the parts we transform are where we expect them.
for (const [what, re] of [["background rect", /<rect width="1024" height="1024" rx="\d+"/], ["stamp circle", /<circle /], ["tick", /<polyline /]]) {
  if (!re.test(clean)) throw new Error(`Source SVG changed: no ${what}`);
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
const flat = (svg, size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).flatten({ background: "#EE6A4B" }).png({ compressionLevel: 9 }).toBuffer();

// Maskable safe zone: circle of radius 0.4 × size around the centre. Farthest artwork point is the
// tick stamp's edge at ~490/1024 from the centre; 0.78 brings it to ~382 (< 409.6), S corner ~325.
const MASKABLE_SCALE = 0.78;

fs.writeFileSync(path.join(dir, "icon.svg"), clean);
fs.writeFileSync(path.join(dir, "apple-touch-icon.png"), await flat(fullBleed(clean), 180));
fs.writeFileSync(path.join(dir, "icon-192.png"), await png(clean, 192));
fs.writeFileSync(path.join(dir, "icon-512.png"), await png(clean, 512));
fs.writeFileSync(path.join(dir, "icon-maskable-512.png"), await flat(scaled(fullBleed(clean), MASKABLE_SCALE), 512));

// Notification badge: the S alone, white, transparent background (Android uses it as a mask).
const sPath = /<path transform="translate\(274[^"]*" d="([^"]+)"/.exec(clean)?.[1];
if (!sPath) throw new Error("Source SVG changed: no main S path");
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><path transform="translate(${512 - 196} ${512 + 280}) scale(0.74667 -0.74667)" d="${sPath}" fill="#FFFFFF"/></svg>`;
fs.writeFileSync(path.join(dir, "badge-96.png"), await png(badge, 96));

// favicon.ico: PNG-compressed entries (supported by every current browser).
const entries = [
  [16, await png(noEcho(noStamp(clean)), 16)],
  [32, await png(clean, 32)],
  [48, await png(clean, 48)],
];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
let offset = 6 + 16 * entries.length;
const dirs = entries.map(([size, data]) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0);
  e.writeUInt8(size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
fs.writeFileSync(path.join(process.cwd(), "public", "favicon.ico"), Buffer.concat([header, ...dirs, ...entries.map(([, d]) => d)]));
// The 16/32 previews too, for eyeballing.
fs.writeFileSync(path.join(dir, "favicon-16.png"), entries[0][1]);
fs.writeFileSync(path.join(dir, "favicon-32.png"), entries[1][1]);

console.log("icons written to public/brand and public/favicon.ico");

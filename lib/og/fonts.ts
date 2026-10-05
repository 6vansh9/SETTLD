import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Fonts bundled in assets/fonts (static weights: Satori can't use variable fonts), read from disk
 * at render time, never fetched from Google. next.config.mjs traces assets/fonts into the
 * /api/og/* functions on Vercel.
 */
const FILES = {
  Anton: "Anton-Regular.ttf",
  "Big Shoulders Display": "BigShouldersDisplay-ExtraBold.ttf",
  "Jersey 10": "Jersey10-Regular.ttf",
  Inter: "Inter-SemiBold.ttf",
} as const;

let cache: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: "normal" }[]> | null = null;

export function ogFonts() {
  cache ??= Promise.all(
    (Object.entries(FILES) as [keyof typeof FILES, string][]).map(async ([name, file]) => {
      const buf = await readFile(path.join(process.cwd(), "assets", "fonts", file));
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const weight = name === "Inter" ? 600 : name === "Big Shoulders Display" ? 800 : 400;
      return { name, data, weight: weight as 400 | 600 | 800, style: "normal" as const };
    }),
  );
  return cache;
}

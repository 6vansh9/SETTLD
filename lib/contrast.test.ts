import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

/** Read the real tokens from globals.css (light :root and .dark blocks) so tests can't drift. */
const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");
function tokens(block: RegExp) {
  const body = block.exec(css)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
const light = tokens(/:root \{([\s\S]*?)\n\}/);
const dark = { ...light, ...tokens(/:root\.dark \{([\s\S]*?)\n\}/) };
const PASTELS = ["pink", "sky", "mint", "butter", "lilac", "peach"];
const AA = 4.5;

describe("owe/owed contrast (WCAG AA, normal text)", () => {
  for (const [mode, t] of [["light", light], ["dark", dark]] as const) {
    it(`${mode}: red/green text on the page and on surfaces`, () => {
      for (const ink of ["owe-ink", "owed-ink"]) {
        expect(contrastRatio(t[ink], t.bg), `${mode} ${ink} on bg`).toBeGreaterThanOrEqual(AA);
        expect(contrastRatio(t[ink], t.surface), `${mode} ${ink} on surface`).toBeGreaterThanOrEqual(AA);
      }
    });

    it(`${mode}: status chips (dark text on the red/green fill) pass on every pastel card`, () => {
      for (const fill of ["owe", "owed"]) {
        expect(contrastRatio(t["on-pastel"], t[fill]), `${mode} text on ${fill} chip`).toBeGreaterThanOrEqual(AA);
      }
      // the settled chip is dark text on the pastel itself
      for (const p of PASTELS) expect(contrastRatio(t["on-pastel"], t[p]), `on-pastel on ${p}`).toBeGreaterThanOrEqual(AA);
    });
  }

  it("documents why: the PRD fills alone fail as small text on the light page", () => {
    expect(contrastRatio(light.owe, light.bg)).toBeLessThan(AA);
    expect(contrastRatio(light.owed, light.bg)).toBeLessThan(AA);
  });
});

/** Composite an rgb(r g b / a) token over a solid background → #rrggbb. */
function over(token: string, bg: string): string {
  const m = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(token);
  if (!m) throw new Error(`not an rgba token: ${token}`);
  const a = Number(m[4]);
  const b = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
  return `#${[1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + b[k] * (1 - a)).toString(16).padStart(2, "0")).join("")}`;
}
const faded = (block: RegExp) => /--ink-faded:\s*(rgb\([^)]+\))/.exec(block.exec(css)?.[1] ?? "")?.[1] ?? "";

describe("faded ink (micro labels, faded title lines) meets AA", () => {
  it("light and dark, on the page and on surfaces", () => {
    const l = faded(/:root \{([\s\S]*?)\n\}/);
    const d = faded(/:root\.dark \{([\s\S]*?)\n\}/);
    expect(contrastRatio(over(l, light.bg), light.bg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(over(l, light.surface), light.surface)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(over(d, dark.bg), dark.bg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(over(d, dark.surface), dark.surface)).toBeGreaterThanOrEqual(AA);
  });
});

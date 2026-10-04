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

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { splashScreens } from "./splash";

describe("iOS splash screens", () => {
  it("every linked image exists, light + dark for each size", () => {
    const list = splashScreens();
    expect(list).toHaveLength(22);
    for (const s of list) expect(fs.existsSync(path.join(process.cwd(), "public", s.url))).toBe(true);
    expect(list.filter((s) => s.media.includes("dark"))).toHaveLength(11);
  });
});

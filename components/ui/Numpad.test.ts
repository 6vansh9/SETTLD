import { describe, expect, it } from "vitest";
import { draftToMinor, pressKey } from "./Numpad";

const type = (keys: string[], decimals = 2) =>
  keys.reduce((d, k) => pressKey(d, k as Parameters<typeof pressKey>[1], decimals), "");

describe("Numpad key handling", () => {
  it("builds amounts and outputs minor units", () => {
    const d = type(["1", "2", "4", "0", ".", "5"]);
    expect(d).toBe("1240.5");
    expect(draftToMinor(d, "INR")).toBe(124050n);
  });

  it("allows at most 2 decimals and one dot", () => {
    expect(type(["9", ".", "9", "9", "9"])).toBe("9.99");
    expect(type(["1", ".", ".", "5"])).toBe("1.5");
  });

  it("starts with 0. when dot is pressed first and drops leading zeros", () => {
    expect(type(["."])).toBe("0.");
    expect(type(["0", "0", "7"])).toBe("7");
    expect(draftToMinor(type([".", "0", "1"]), "USD")).toBe(1n);
  });

  it("backspace removes the last character", () => {
    expect(type(["1", "2", ".", "back", "back"])).toBe("1");
    expect(type(["back"])).toBe("");
  });

  it("treats empty input as zero", () => {
    expect(draftToMinor("", "INR")).toBe(0n);
    expect(draftToMinor("0.", "INR")).toBe(0n);
  });
});

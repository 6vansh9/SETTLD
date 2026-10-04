import { describe, expect, it } from "vitest";
import { allocateToBase, convertMinor, parseRate, rateToString } from "./money";

describe("rates", () => {
  it("parses and prints decimal rates exactly", () => {
    expect(rateToString(parseRate("96.32")!)).toBe("96.32");
    expect(rateToString(parseRate("0.89087")!)).toBe("0.89087");
    expect(rateToString(parseRate("1")!)).toBe("1");
    expect(rateToString(parseRate("83.0000000001")!)).toBe("83.0000000001");
    expect(rateToString(parseRate(96.32)!)).toBe("96.32");
  });

  it("rejects zero, negatives, junk and > 10 decimals", () => {
    for (const bad of ["0", "0.0", "-1", "abc", "", "1.00000000001", "1e3", "1,5"]) expect(parseRate(bad)).toBeNull();
  });
});

describe("convertMinor", () => {
  it("converts $40 at 83.5 → ₹3,340", () => {
    expect(convertMinor(4000, parseRate("83.5")!)).toBe(334000);
  });

  it("rounds half up", () => {
    expect(convertMinor(1, parseRate("0.5")!)).toBe(1); // 0.5 paise → 1
    expect(convertMinor(1, parseRate("0.49")!)).toBe(0);
    expect(convertMinor(3, parseRate("0.5")!)).toBe(2); // 1.5 → 2
  });

  it("is exact for big amounts and long rates", () => {
    // $90bn at 96.3212345678 = ₹8,668,911,111,102.00 exactly
    expect(convertMinor(9_000_000_000_000, parseRate("96.3212345678")!)).toBe(866_891_111_110_200);
  });

  it("refuses results beyond exact integer range instead of rounding silently", () => {
    expect(() => convertMinor(9_000_000_000_000, parseRate("250000.5")!)).toThrow(RangeError);
  });

  it("rate 1 is the identity", () => {
    expect(convertMinor(123456, parseRate("1")!)).toBe(123456);
  });
});

describe("allocateToBase", () => {
  it("keeps proportions and sums exactly to the converted total", () => {
    // $10 split 3.34 / 3.33 / 3.33 at 96.32 → ₹963.20
    const base = convertMinor(1000, parseRate("96.32")!);
    expect(base).toBe(96320);
    const parts = allocateToBase([334, 333, 333], base);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(96320);
    expect(parts).toEqual([32171, 32075, 32074]);
  });

  it("zero entries stay zero", () => {
    expect(allocateToBase([0, 500, 500], 9632)).toEqual([0, 4816, 4816]);
  });
});

import { describe, expect, it } from "vitest";
import {
  CURRENCY_CODES,
  formatAmount,
  formatParts,
  fromMinor,
  groupDigits,
  percentages,
  splitEqual,
  toMinor,
} from "./money";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("toMinor", () => {
  it("parses whole and decimal strings", () => {
    expect(toMinor("1240", "INR")).toBe(124000n);
    expect(toMinor("1240.5", "INR")).toBe(124050n);
    expect(toMinor("1240.50", "INR")).toBe(124050n);
    expect(toMinor("0.01", "USD")).toBe(1n);
    expect(toMinor(".5", "EUR")).toBe(50n);
    expect(toMinor("12.", "GBP")).toBe(1200n);
  });

  it("ignores grouping separators", () => {
    expect(toMinor("1,24,000.25", "INR")).toBe(12400025n);
  });

  it("avoids float artefacts for number input", () => {
    expect(toMinor(0.1, "INR") + toMinor(0.2, "INR")).toBe(30n);
    // 1.005 * 100 === 100.49999999999999: rejected rather than silently rounded
    expect(() => toMinor(1.005 * 100, "INR")).toThrow(RangeError);
  });

  it("handles negatives and huge values", () => {
    expect(toMinor("-40", "USD")).toBe(-4000n);
    expect(toMinor("90071992547409.93", "INR")).toBe(9007199254740993n);
  });

  it("rejects too many decimals and garbage", () => {
    expect(() => toMinor("1.234", "INR")).toThrow(RangeError);
    expect(() => toMinor("abc", "INR")).toThrow(RangeError);
    expect(() => toMinor("", "INR")).toThrow(RangeError);
    expect(() => toMinor(".", "INR")).toThrow(RangeError);
  });
});

describe("fromMinor", () => {
  it("returns exact decimal strings", () => {
    expect(fromMinor(124050, "INR")).toBe("1240.50");
    expect(fromMinor(1, "USD")).toBe("0.01");
    expect(fromMinor(0, "USD")).toBe("0.00");
    expect(fromMinor(-5, "EUR")).toBe("-0.05");
    expect(fromMinor(9007199254740993n, "INR")).toBe("90071992547409.93");
  });

  it("round-trips with toMinor", () => {
    for (const c of CURRENCY_CODES) {
      for (const v of [0n, 1n, 99n, 100n, 123456789n, -4200n]) {
        expect(toMinor(fromMinor(v, c), c)).toBe(v);
      }
    }
  });

  it("rejects non-integer minor units", () => {
    expect(() => fromMinor(1.5, "INR")).toThrow(RangeError);
  });
});

describe("groupDigits / formatting", () => {
  it("uses Indian grouping for INR", () => {
    expect(groupDigits("124000", "indian")).toBe("1,24,000");
    expect(groupDigits("12345678", "indian")).toBe("1,23,45,678");
    expect(groupDigits("999", "indian")).toBe("999");
    expect(groupDigits("1000", "indian")).toBe("1,000");
  });

  it("uses Western grouping otherwise", () => {
    expect(groupDigits("124000", "western")).toBe("124,000");
    expect(groupDigits("12345678", "western")).toBe("12,345,678");
  });

  it("splits amounts into strong and faded parts", () => {
    expect(formatParts(12400050, "INR")).toEqual({
      negative: false,
      symbol: "₹",
      whole: "1,24,000",
      fraction: ".50",
    });
    expect(formatParts(-4000, "USD")).toEqual({
      negative: true,
      symbol: "$",
      whole: "40",
      fraction: ".00",
    });
  });

  it("formats plain text", () => {
    expect(formatAmount(124050, "INR")).toBe("₹1,240.50");
    expect(formatAmount(12000000, "AUD")).toBe("A$120,000.00");
    expect(formatAmount(-1, "GBP")).toBe("-£0.01");
  });
});

describe("splitEqual", () => {
  it("₹100 split 3 ways gives the extra paisa to the first member", () => {
    const parts = splitEqual(10000, 3);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(sum(parts)).toBe(10000);
  });

  it("₹0.01 split 2 ways", () => {
    expect(splitEqual(1, 2)).toEqual([1, 0]);
  });

  it("splits evenly when possible", () => {
    expect(splitEqual(240000, 4)).toEqual([60000, 60000, 60000, 60000]);
  });

  it("handles zero and a single person", () => {
    expect(splitEqual(0, 3)).toEqual([0, 0, 0]);
    expect(splitEqual(777, 1)).toEqual([777]);
  });

  it("handles negative totals symmetrically", () => {
    const parts = splitEqual(-10000, 3);
    expect(parts).toEqual([-3334, -3333, -3333]);
    expect(sum(parts)).toBe(-10000);
  });

  it("handles large amounts beyond float precision with bigint", () => {
    const total = 9_007_199_254_740_993n; // > Number.MAX_SAFE_INTEGER
    const parts = splitEqual(total, 7);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
    expect(parts[0] - parts[6]).toBeLessThanOrEqual(1n);
  });

  it("large safe-integer amounts stay exact", () => {
    const total = Number.MAX_SAFE_INTEGER;
    const parts = splitEqual(total, 13);
    expect(parts.reduce((a, b) => BigInt(a) + BigInt(b), 0n)).toBe(BigInt(total));
  });

  it("property: parts sum to total and differ by at most 1", () => {
    for (let i = 0; i < 1000; i++) {
      const total = Math.floor(Math.random() * 10_000_000);
      const n = 1 + Math.floor(Math.random() * 20);
      const parts = splitEqual(total, n);
      expect(parts).toHaveLength(n);
      expect(sum(parts)).toBe(total);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      // leftover goes to the first members: non-increasing order
      for (let j = 1; j < n; j++) expect(parts[j]).toBeLessThanOrEqual(parts[j - 1]);
    }
  });

  it("rejects invalid inputs", () => {
    expect(() => splitEqual(100, 0)).toThrow(RangeError);
    expect(() => splitEqual(100, 2.5)).toThrow(RangeError);
    expect(() => splitEqual(10.5, 2)).toThrow(RangeError);
  });
});

describe("percentages", () => {
  it("always sums to 100", () => {
    expect(percentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sum(percentages([3334, 3333, 3333]))).toBe(100);
    expect(percentages([50, 25, 25])).toEqual([50, 25, 25]);
  });

  it("returns zeros for an empty total", () => {
    expect(percentages([0, 0])).toEqual([0, 0]);
  });
});

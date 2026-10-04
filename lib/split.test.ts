import { describe, expect, it } from "vitest";
import {
  PERCENT_TOTAL,
  computeSplits,
  formatPercent,
  parsePercent,
  parseShares,
  payersRemaining,
  splitByWeights,
  validatePayers,
} from "./money";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ memberId: `m${i}` }));
const amounts = (r: ReturnType<typeof computeSplits>) => (r.ok ? r.splits.map((s) => s.amount) : null);

describe("splitByWeights", () => {
  it("splits proportionally and gives leftovers to the first weighted members", () => {
    expect(splitByWeights(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(splitByWeights(100, [2, 1, 1])).toEqual([50, 25, 25]);
    expect(splitByWeights(101, [2, 1, 1])).toEqual([51, 25, 25]);
    expect(splitByWeights(10, [0, 1, 1, 1])).toEqual([0, 4, 3, 3]);
  });

  it("never gives leftovers to zero-weight members", () => {
    expect(splitByWeights(2, [0, 0, 1, 1, 1])).toEqual([0, 0, 1, 1, 0]);
  });

  it("is exact for totals × weights beyond 2^53", () => {
    const total = 9_000_000_000_000; // ₹90 billion in paise
    const parts = splitByWeights(total, [3333, 3333, 3334]);
    expect(sum(parts)).toBe(total);
  });

  it("rejects bad input", () => {
    expect(() => splitByWeights(100, [0, 0])).toThrow(RangeError);
    expect(() => splitByWeights(100, [-1, 2])).toThrow(RangeError);
    expect(() => splitByWeights(1.5, [1])).toThrow(RangeError);
  });
});

describe("computeSplits", () => {
  it("equal: ₹100 three ways", () => {
    expect(amounts(computeSplits(10000, "equal", ids(3)))).toEqual([3334, 3333, 3333]);
  });

  it("equal: ₹0.01 two ways", () => {
    expect(amounts(computeSplits(1, "equal", ids(2)))).toEqual([1, 0]);
  });

  it("exact: must assign every paisa", () => {
    const members = [{ memberId: "a", value: 6000 }, { memberId: "b", value: 4000 }];
    expect(amounts(computeSplits(10000, "exact", members))).toEqual([6000, 4000]);
    const short = computeSplits(10000, "exact", [{ memberId: "a", value: 6000 }, { memberId: "b", value: 0 }]);
    expect(short).toMatchObject({ ok: false, remaining: 4000 });
    const over = computeSplits(10000, "exact", [{ memberId: "a", value: 12000 }]);
    expect(over).toMatchObject({ ok: false, remaining: -2000 });
  });

  it("percent: 33.33 / 33.33 / 33.34 of ₹100", () => {
    const r = computeSplits(10000, "percent", [
      { memberId: "a", value: 3333 },
      { memberId: "b", value: 3333 },
      { memberId: "c", value: 3334 },
    ]);
    expect(amounts(r)).toEqual([3333, 3333, 3334]);
  });

  it("percent: must add to 100%", () => {
    expect(computeSplits(10000, "percent", [{ memberId: "a", value: 5000 }])).toMatchObject({ ok: false, remainingPercent: 5000 });
    expect(computeSplits(10000, "percent", [{ memberId: "a", value: 6000 }, { memberId: "b", value: 5000 }])).toMatchObject({
      ok: false,
      remainingPercent: -1000,
    });
  });

  it("shares: 2:1:1", () => {
    const r = computeSplits(240000, "shares", [
      { memberId: "a", value: 2 },
      { memberId: "b", value: 1 },
      { memberId: "c", value: 1 },
    ]);
    expect(amounts(r)).toEqual([120000, 60000, 60000]);
    expect(r.ok && r.splits.map((s) => s.rawValue)).toEqual([2, 1, 1]);
  });

  it("rejects empty and duplicate members and zero totals", () => {
    expect(computeSplits(100, "equal", [])).toMatchObject({ ok: false });
    expect(computeSplits(100, "equal", [{ memberId: "a" }, { memberId: "a" }])).toMatchObject({ ok: false });
    expect(computeSplits(0, "equal", ids(2))).toMatchObject({ ok: false });
    expect(computeSplits(100, "shares", [{ memberId: "a", value: 0 }])).toMatchObject({ ok: false });
  });
});

describe("payers", () => {
  it("must sum to the total", () => {
    const payers = [{ memberId: "a", amount: 3000 }, { memberId: "b", amount: 7000 }];
    expect(validatePayers(10000, payers)).toBeNull();
    expect(payersRemaining(10000, payers.slice(0, 1))).toBe(7000);
    expect(validatePayers(10000, payers.slice(0, 1))).toMatch(/don't cover/);
    expect(validatePayers(5000, payers)).toMatch(/more than/);
    expect(validatePayers(10000, [])).toMatch(/who paid/);
    expect(validatePayers(10000, [{ memberId: "a", amount: 10000 }, { memberId: "a", amount: 0 }])).toBeTruthy();
  });
});

describe("parsing", () => {
  it("parses percentages to basis points", () => {
    expect(parsePercent("33.33")).toBe(3333);
    expect(parsePercent("50")).toBe(5000);
    expect(parsePercent("12.5")).toBe(1250);
    expect(parsePercent("100")).toBe(PERCENT_TOTAL);
    expect(parsePercent("100.01")).toBeNull();
    expect(parsePercent("1.234")).toBeNull();
    expect(parsePercent("-5")).toBeNull();
    expect(parsePercent("")).toBeNull();
    expect(formatPercent(3333)).toBe("33.33");
    expect(formatPercent(1250)).toBe("12.5");
    expect(formatPercent(5000)).toBe("50");
  });

  it("parses shares", () => {
    expect(parseShares("2")).toBe(2);
    expect(parseShares("0")).toBe(0);
    expect(parseShares("1.5")).toBeNull();
    expect(parseShares("1001")).toBeNull();
  });
});

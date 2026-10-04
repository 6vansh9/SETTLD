import { describe, expect, it } from "vitest";
import { convertedTotal, myNetInGroup, myPositionOnExpense, overallTotals, oweOwedTotals } from "./balances";

const g = (id: string, cur: "INR" | "USD", meId: string, left: string | null = null) => ({
  id,
  base_currency: cur,
  members: [
    { id: meId, user_id: "me", left_at: left },
    { id: `${id}-x`, user_id: "x", left_at: null },
  ],
});

describe("balances", () => {
  const groups = [g("g1", "INR", "m1"), g("g2", "INR", "m2"), g("g3", "USD", "m3")];
  const balances = [
    { group_id: "g1", member_id: "m1", net: -34050 },
    { group_id: "g1", member_id: "g1-x", net: 34050 },
    { group_id: "g2", member_id: "m2", net: 124000 },
    { group_id: "g3", member_id: "m3", net: 4000 },
  ];

  it("finds your net per group", () => {
    expect(myNetInGroup(groups[0], balances, "me")).toBe(-34050);
    expect(myNetInGroup(groups[0], balances, "nobody")).toBe(0);
  });

  it("totals per currency, default currency first, nothing converted", () => {
    expect(overallTotals(groups, balances, "me", "INR")).toEqual({ primary: 89950, others: [{ currency: "USD", net: 4000 }] });
    expect(overallTotals(groups, balances, "me", "USD")).toEqual({ primary: 4000, others: [{ currency: "INR", net: 89950 }] });
  });

  it("drops zero lines and ignores groups you've left", () => {
    expect(overallTotals([g("g1", "USD", "m1", "2026-01-01")], balances, "me", "INR")).toEqual({ primary: 0, others: [] });
  });

  it("computes your position on an expense", () => {
    const e = { payers: [{ member_id: "a", amount_base: 60000 }], splits: [{ member_id: "a", amount_base: 20000 }, { member_id: "b", amount_base: 40000 }] };
    expect(myPositionOnExpense(e, "a")).toEqual({ involved: true, net: 40000 }); // lent 400
    expect(myPositionOnExpense(e, "b")).toEqual({ involved: true, net: -40000 }); // owes 400
    expect(myPositionOnExpense(e, "c")).toEqual({ involved: false, net: 0 });
  });
});

describe("convertedTotal", () => {
  it("converts other currencies with the cached rate and flags approx", () => {
    const totals = { primary: 89950, others: [{ currency: "USD" as const, net: 4000 }, { currency: "EUR" as const, net: -1000 }] };
    expect(convertedTotal(totals, "INR", { "USD:INR": "96.32", "EUR:INR": "108.1" })).toEqual({
      total: 89950 + 385280 - 108100,
      approx: true,
      unconverted: [],
    });
  });

  it("keeps a currency separate when no rate exists at all", () => {
    const totals = { primary: 100, others: [{ currency: "GBP" as const, net: 500 }] };
    expect(convertedTotal(totals, "INR", {})).toEqual({ total: 100, approx: false, unconverted: [{ currency: "GBP", net: 500 }] });
  });

  it("is exact (not approx) when everything is already in the default currency", () => {
    expect(convertedTotal({ primary: -500, others: [] }, "INR", {})).toEqual({ total: -500, approx: false, unconverted: [] });
  });
});

describe("oweOwedTotals", () => {
  const grp = (id: string, cur: "INR" | "USD" | "EUR" | "GBP", net: number) => ({
    group: { id, base_currency: cur, members: [{ id: `${id}-me`, user_id: "me", left_at: null }] },
    balance: { group_id: id, member_id: `${id}-me`, net },
  });

  it("splits groups into owe and owed (no netting across groups)", () => {
    const g = [grp("g1", "INR", -50000), grp("g2", "INR", 120000), grp("g3", "INR", -20000), grp("g4", "INR", 0)];
    expect(oweOwedTotals(g.map((x) => x.group), g.map((x) => x.balance), "me", "INR")).toEqual({
      owe: 70000,
      owed: 120000,
      net: 50000,
      approx: false,
      unconverted: [],
    });
  });

  it("converts each group separately into my currency and flags approx", () => {
    const g = [grp("in", "INR", -50000), grp("us", "USD", 4000), grp("eu", "EUR", -1000)];
    const t = oweOwedTotals(g.map((x) => x.group), g.map((x) => x.balance), "me", "INR", { "USD:INR": "96.32", "EUR:INR": "108.1" });
    expect(t).toEqual({ owe: 50000 + 108100, owed: 385280, net: 385280 - 158100, approx: true, unconverted: [] });
  });

  it("a currency with no rate stays out of the totals, listed separately", () => {
    const g = [grp("in", "INR", 1000), grp("gb", "GBP", -500)];
    expect(oweOwedTotals(g.map((x) => x.group), g.map((x) => x.balance), "me", "INR", {})).toEqual({
      owe: 0,
      owed: 1000,
      net: 1000,
      approx: false,
      unconverted: [{ currency: "GBP", owe: 500, owed: 0 }],
    });
  });

  it("all settled", () => {
    const g = [grp("a", "INR", 0)];
    expect(oweOwedTotals(g.map((x) => x.group), g.map((x) => x.balance), "me", "INR")).toMatchObject({ owe: 0, owed: 0, net: 0 });
  });
});

import { describe, expect, it } from "vitest";
import {
  draftFromExpense,
  evaluateDraft,
  expenseResult,
  fillPayer,
  localDate,
  newDraft,
  parseMoney,
  payerFillSuggestion,
  setPayerAmount,
  switchPayerMode,
  toRpcArgs,
  withAmount,
} from "./expense-form";

const M = ["a", "b", "c"];
const base = () => ({ ...newDraft(M, "a", "2026-10-04"), amount: 10000, title: "Dinner" });

describe("newDraft", () => {
  it("defaults: me paying, everyone in an equal split, 1 share each", () => {
    const d = newDraft(M, "b", "2026-10-04");
    expect(d).toMatchObject({ payerMode: "single", payerId: "b", splitType: "equal", included: M, date: "2026-10-04" });
    expect(d.shares).toEqual({ a: "1", b: "1", c: "1" });
  });

  it("formats local dates", () => {
    expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("evaluateDraft", () => {
  it("equal split is valid out of the box", () => {
    const e = evaluateDraft(base(), M, "INR");
    expect(e.canSave).toBe(true);
    expect([...e.splitAmounts.values()]).toEqual([3334, 3333, 3333]);
    expect(e.payers).toEqual([{ memberId: "a", amount: 10000 }]);
  });

  it("requires an amount and a title", () => {
    const e = evaluateDraft({ ...base(), amount: 0, title: " " }, M, "INR");
    expect(e.canSave).toBe(false);
    expect(e.errors).toMatchObject({ amount: expect.any(String), title: expect.any(String) });
  });

  it("toggling people out re-splits among the rest (in member order)", () => {
    const e = evaluateDraft({ ...base(), included: ["c", "a"] }, M, "INR");
    expect(e.splits?.map((s) => s.memberId)).toEqual(["a", "c"]);
    expect(e.splits?.map((s) => s.amount)).toEqual([5000, 5000]);
  });

  it("exact: live amount left to assign, blocks saving until zero", () => {
    let e = evaluateDraft({ ...base(), splitType: "exact", exact: { a: "60" } }, M, "INR");
    expect(e.canSave).toBe(false);
    expect(e.splitLeft).toEqual({ kind: "amount", value: 4000 }); // ₹40 left
    e = evaluateDraft({ ...base(), splitType: "exact", exact: { a: "60", b: "50" } }, M, "INR");
    expect(e.splitLeft).toEqual({ kind: "amount", value: -1000 }); // ₹10 over
    e = evaluateDraft({ ...base(), splitType: "exact", exact: { a: "60", b: "40" } }, M, "INR");
    expect(e.canSave).toBe(true);
    expect(e.splitLeft).toBeNull();
  });

  it("exact: rejects malformed amounts", () => {
    const e = evaluateDraft({ ...base(), splitType: "exact", exact: { a: "6.005" } }, M, "INR");
    expect(e.errors.split).toMatch(/Check the amounts/);
  });

  it("percent: live percent left", () => {
    let e = evaluateDraft({ ...base(), splitType: "percent", percent: { a: "50", b: "25" } }, M, "INR");
    expect(e.splitLeft).toEqual({ kind: "percent", value: 2500 });
    e = evaluateDraft({ ...base(), splitType: "percent", percent: { a: "50", b: "25", c: "25" } }, M, "INR");
    expect(e.canSave).toBe(true);
    expect(e.splits?.map((s) => [s.amount, s.rawValue])).toEqual([[5000, 5000], [2500, 2500], [2500, 2500]]);
  });

  it("shares: 2:1:1", () => {
    const e = evaluateDraft({ ...base(), amount: 240000, splitType: "shares", shares: { a: "2", b: "1", c: "1" } }, M, "INR");
    expect(e.splits?.map((s) => s.amount)).toEqual([120000, 60000, 60000]);
  });

  it("multiple payers: live amount left, must equal the total", () => {
    let e = evaluateDraft({ ...base(), payerMode: "multiple", payerAmounts: { a: "30" } }, M, "INR");
    expect(e.payersLeft).toBe(7000);
    expect(e.canSave).toBe(false);
    e = evaluateDraft({ ...base(), payerMode: "multiple", payerAmounts: { a: "30", b: "70" } }, M, "INR");
    expect(e.payersLeft).toBeNull();
    expect(e.payers).toEqual([{ memberId: "a", amount: 3000 }, { memberId: "b", amount: 7000 }]);
    expect(e.canSave).toBe(true);
    e = evaluateDraft({ ...base(), payerMode: "multiple", payerAmounts: { a: "80", b: "70" } }, M, "INR");
    expect(e.payersLeft).toBe(-5000);
  });

  it("builds RPC args with integer minor units", () => {
    const d = { ...base(), note: "  tip incl. " };
    const args = toRpcArgs(d, evaluateDraft(d, M, "INR"));
    expect(args).toMatchObject({ title: "Dinner", amount: 10000, note: "tip incl.", splitType: "equal" });
    expect(args.splits.reduce((s, x) => s + x.amount, 0)).toBe(10000);
    expect(args.payers).toEqual([{ member_id: "a", amount: 10000 }]);
  });
});

describe("draftFromExpense (edit) round-trips", () => {
  it.each([
    ["equal", { a: null, b: null }],
    ["exact", { a: 6000, b: 4000 }],
    ["percent", { a: 6000, b: 4000 }],
    ["shares", { a: 3, b: 2 }],
  ] as const)("%s", (type, raw) => {
    const amounts = type === "shares" ? { a: 6000, b: 4000 } : { a: type === "equal" ? 5000 : 6000, b: type === "equal" ? 5000 : 4000 };
    const saved = {
      title: "Dinner",
      amount: 10000,
      category: "food",
      date: "2026-10-01",
      note: null,
      payers: [{ member_id: "a", amount_base: 3000 }, { member_id: "b", amount_base: 7000 }],
      splits: (["a", "b"] as const).map((id) => ({ member_id: id, amount_base: amounts[id], split_type: type, raw_value: raw[id] })),
    };
    const d = draftFromExpense(saved, "INR");
    const e = evaluateDraft(d, M, "INR");
    expect(e.canSave).toBe(true);
    expect(e.splits?.map((s) => s.amount)).toEqual([amounts.a, amounts.b]);
    expect(e.payers).toEqual([{ memberId: "a", amount: 3000 }, { memberId: "b", amount: 7000 }]);
  });
});

describe("parseMoney", () => {
  it("parses typed amounts", () => {
    expect(parseMoney("40", "INR")).toBe(4000);
    expect(parseMoney("1,240.5", "INR")).toBe(124050);
    expect(parseMoney("", "INR")).toBe(0);
    expect(parseMoney("abc", "INR")).toBeNull();
    expect(parseMoney("-5", "INR")).toBeNull();
  });
});

describe("foreign-currency expenses", () => {
  const usd = () => ({ ...base(), currency: "USD" as const, rate: "83.5", amount: 4000 }); // $40 in an INR group

  it("converts the total and stores base lines that sum exactly", () => {
    const e = evaluateDraft(usd(), M, "INR");
    expect(e.canSave).toBe(true);
    expect(e.amountBase).toBe(334000); // ≈ ₹3,340
    expect(e.rate).toBe("83.5");
    expect([...e.splitAmounts.values()]).toEqual([1334, 1333, 1333]); // shown in $
    expect(e.splits?.map((s) => s.amount)).toEqual([111390, 111305, 111305]); // stored in ₹ (leftover paisa → first)
    expect(e.splits?.reduce((a, s) => a + s.amount, 0)).toBe(334000);
    expect(e.payers).toEqual([{ memberId: "a", amount: 334000 }]);
  });

  it("needs a valid rate before saving", () => {
    expect(evaluateDraft({ ...usd(), rate: "" }, M, "INR").errors.rate).toMatch(/Waiting/);
    expect(evaluateDraft({ ...usd(), rate: "abc" }, M, "INR").errors.rate).toMatch(/valid/);
    expect(evaluateDraft({ ...usd(), rate: "0" }, M, "INR").canSave).toBe(false);
  });

  it("a manual override changes amount_base", () => {
    expect(evaluateDraft({ ...usd(), rate: "90", rateSource: "manual" }, M, "INR").amountBase).toBe(360000);
  });

  it("exact amounts are typed in the expense currency; raw_value keeps them", () => {
    const d = { ...usd(), splitType: "exact" as const, exact: { a: "25", b: "15" } };
    const e = evaluateDraft(d, M, "INR");
    expect(e.canSave).toBe(true);
    const args = toRpcArgs(d, e);
    expect(args).toMatchObject({ amount: 4000, currency: "USD", fxRate: "83.5" });
    expect(args.splits).toEqual([
      { member_id: "a", amount: 208750, raw_value: 2500 },
      { member_id: "b", amount: 125250, raw_value: 1500 },
    ]);
  });

  it("multiple payers typed in $ are converted to ₹ exactly", () => {
    const e = evaluateDraft({ ...usd(), payerMode: "multiple", payerAmounts: { a: "30", b: "10" } }, M, "INR");
    expect(e.payers).toEqual([{ memberId: "a", amount: 250500 }, { memberId: "b", amount: 83500 }]);
  });

  it("the group currency ignores any typed rate", () => {
    const e = evaluateDraft({ ...base(), rate: "999" }, M, "INR");
    expect(e.rate).toBe("1");
    expect(e.amountBase).toBe(10000);
  });

  it("refuses amounts that are too large after conversion", () => {
    expect(evaluateDraft({ ...usd(), amount: 9_000_000_000_000, rate: "250000" }, M, "INR").errors.amount).toMatch(/too large/);
  });

  it("edit round-trip keeps currency, rate, exact $ amounts and $ payer amounts", () => {
    const saved = {
      title: "Hotel",
      amount: 4000,
      currency: "USD" as const,
      fx_rate_to_base: "83.5000000000",
      category: "stay",
      date: "2026-10-01",
      note: null,
      payers: [{ member_id: "a", amount_base: 250500 }, { member_id: "b", amount_base: 83500 }],
      splits: [
        { member_id: "a", amount_base: 208750, split_type: "exact", raw_value: 2500 },
        { member_id: "b", amount_base: 125250, split_type: "exact", raw_value: 1500 },
      ],
    };
    const d = draftFromExpense(saved, "INR");
    expect(d).toMatchObject({ currency: "USD", rate: "83.5", exact: { a: "25", b: "15" }, payerAmounts: { a: "30", b: "10" } });
    const e = evaluateDraft(d, M, "INR");
    expect(e.splits?.map((s) => s.amount)).toEqual([208750, 125250]);
    expect(e.payers?.map((p) => p.amount)).toEqual([250500, 83500]);
  });
});

describe("multiple payers: auto-fill", () => {
  const two = ["a", "b"];
  const three = ["a", "b", "c"];
  const multi = (members: string[]) => switchPayerMode({ ...newDraft(members, "a", "2026-10-04"), amount: 100000, title: "Hotel" }, "multiple", "INR");

  it("switching to Multiple prefills the original payer with the full amount", () => {
    const d = multi(two);
    expect(d.payerAmounts).toEqual({ a: "1000" });
    expect(d.payerTouched).toEqual({});
  });

  it("2 people: typing one fills the other with the rest", () => {
    let d = setPayerAmount(multi(two), "b", "400", two, "INR");
    expect(d.payerAmounts).toEqual({ a: "600", b: "400" });
    d = setPayerAmount(d, "b", "250.5", two, "INR");
    expect(d.payerAmounts.a).toBe("749.50");
    expect(evaluateDraft(d, two, "INR").payers).toEqual([{ memberId: "a", amount: 74950 }, { memberId: "b", amount: 25050 }]);
  });

  it("2 people: once I edit the second one, it is never overwritten again", () => {
    let d = setPayerAmount(multi(two), "b", "400", two, "INR"); // a auto = 600
    d = setPayerAmount(d, "a", "500", two, "INR"); // I take over a
    expect(d.payerAmounts).toEqual({ a: "500", b: "400" });
    d = setPayerAmount(d, "b", "300", two, "INR");
    expect(d.payerAmounts).toEqual({ a: "500", b: "300" }); // both mine: nothing auto-changes
    expect(evaluateDraft(d, two, "INR").payersLeft).toBe(20000); // ₹200 still to pay, shown not fixed
  });

  it("2 people: typing more than the total empties the other instead of going negative", () => {
    expect(setPayerAmount(multi(two), "b", "1200", two, "INR").payerAmounts.a).toBe("");
  });

  it("2 people: half-typed input leaves the other field alone", () => {
    expect(setPayerAmount(multi(two), "b", "4.0.0", two, "INR").payerAmounts.a).toBe("1000");
  });

  it("changing the total keeps the untouched field in step", () => {
    let d = multi(two);
    d = withAmount(d, 150000, two, "INR");
    expect(d.payerAmounts.a).toBe("1500"); // untouched prefill follows the total
    d = setPayerAmount(d, "b", "500", two, "INR");
    d = withAmount(d, 200000, two, "INR");
    expect(d.payerAmounts).toEqual({ a: "1500", b: "500" });
  });

  it("3+ people: no silent filling, a suggestion on the next empty field instead", () => {
    let d = setPayerAmount(multi(three), "a", "600", three, "INR");
    expect(d.payerAmounts).toEqual({ a: "600" });
    expect(payerFillSuggestion(d, three, "INR")).toEqual({ memberId: "b", amount: 40000 });
    d = fillPayer(d, "b", 40000, "INR");
    expect(d.payerAmounts).toEqual({ a: "600", b: "400" });
    expect(d.payerTouched.b).toBe(true);
    expect(payerFillSuggestion(d, three, "INR")).toBeNull(); // fully paid
  });

  it("3+ people: suggestion skips fields I typed in, even if I cleared them", () => {
    let d = setPayerAmount(multi(three), "a", "300", three, "INR");
    d = setPayerAmount(d, "b", "", three, "INR"); // touched then cleared
    expect(payerFillSuggestion(d, three, "INR")).toEqual({ memberId: "c", amount: 70000 });
  });

  it("editing a saved multi-payer expense never auto-changes its amounts", () => {
    const saved = {
      title: "Hotel", amount: 100000, category: "stay", date: "2026-10-01", note: null,
      payers: [{ member_id: "a", amount_base: 60000 }, { member_id: "b", amount_base: 40000 }],
      splits: [{ member_id: "a", amount_base: 50000, split_type: "equal", raw_value: null }, { member_id: "b", amount_base: 50000, split_type: "equal", raw_value: null }],
    };
    const d = setPayerAmount(draftFromExpense(saved, "INR"), "b", "300", two, "INR");
    expect(d.payerAmounts).toEqual({ a: "600", b: "300" });
  });
});

describe("expenseResult (RESULT card)", () => {
  it("2 people: one gets back exactly what the other owes", () => {
    expect(expenseResult([{ memberId: "a", amount: 100000 }], [{ memberId: "a", amount: 50000 }, { memberId: "b", amount: 50000 }], ["a", "b"])).toEqual([
      { memberId: "a", net: 50000 },
      { memberId: "b", net: -50000 },
    ]);
  });

  it("everyone square → empty", () => {
    expect(expenseResult([{ memberId: "a", amount: 500 }, { memberId: "b", amount: 500 }], [{ memberId: "a", amount: 500 }, { memberId: "b", amount: 500 }], ["a", "b"])).toEqual([]);
  });

  it("3+ people: only non-zero lines, in member order, summing to zero", () => {
    const r = expenseResult(
      [{ memberId: "a", amount: 60000 }, { memberId: "b", amount: 30000 }],
      ["a", "b", "c"].map((m) => ({ memberId: m, amount: 30000 })),
      ["a", "b", "c"],
    );
    expect(r).toEqual([{ memberId: "a", net: 30000 }, { memberId: "c", net: -30000 }]);
    expect(r.reduce((s, x) => s + x.net, 0)).toBe(0);
  });

  it("uses exactly what evaluateDraft would save (₹100 three ways)", () => {
    const d = { ...newDraft(["a", "b", "c"], "a", "2026-10-04"), amount: 10000, title: "x" };
    const e = evaluateDraft(d, ["a", "b", "c"], "INR");
    expect(expenseResult(e.payers!, e.splits!, ["a", "b", "c"])).toEqual([
      { memberId: "a", net: 6666 },
      { memberId: "b", net: -3333 },
      { memberId: "c", net: -3333 },
    ]);
  });
});

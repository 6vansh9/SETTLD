import { describe, expect, it } from "vitest";
import { clearsDebt, countsTowardBalances, myTransfers, plannedAmount, settlementPlan } from "./settle";

describe("settle helpers", () => {
  it("disputed and deleted settlements don't count", () => {
    expect(countsTowardBalances({ status: "pending", deleted_at: null })).toBe(true);
    expect(countsTowardBalances({ status: "confirmed", deleted_at: null })).toBe(true);
    expect(countsTowardBalances({ status: "disputed", deleted_at: null })).toBe(false);
    expect(countsTowardBalances({ status: "confirmed", deleted_at: "x" })).toBe(false);
  });

  const expenses = [{ payers: [{ memberId: "a", amount: 900 }], splits: ["a", "b", "c"].map((m) => ({ memberId: m, amount: 300 })) }];

  it("simplified plan comes from balances; raw plan nets settlements (not disputed ones)", () => {
    const balances = [{ memberId: "a", net: 500 }, { memberId: "b", net: -200 }, { memberId: "c", net: -300 }];
    expect(settlementPlan({ simplify: true, balances, expenses, settlements: [] })).toEqual([
      { from: "c", to: "a", amount: 300 },
      { from: "b", to: "a", amount: 200 },
    ]);
    const settlements = [
      { from: "b", to: "a", amount: 100, status: "pending", deleted_at: null },
      { from: "c", to: "a", amount: 300, status: "disputed", deleted_at: null },
    ];
    expect(settlementPlan({ simplify: false, balances, expenses, settlements })).toEqual([
      { from: "c", to: "a", amount: 300 },
      { from: "b", to: "a", amount: 200 },
    ]);
  });

  it("my rows: what I owe first", () => {
    const plan = [{ from: "x", to: "me", amount: 50 }, { from: "me", to: "y", amount: 10 }, { from: "p", to: "q", amount: 99 }];
    expect(myTransfers(plan, "me")).toEqual([{ from: "me", to: "y", amount: 10 }, { from: "x", to: "me", amount: 50 }]);
  });

  it("confetti only when the payment clears the planned debt", () => {
    const plan = [{ from: "b", to: "a", amount: 30000 }];
    expect(plannedAmount(plan, "b", "a")).toBe(30000);
    expect(clearsDebt(plan, "b", "a", 30000)).toBe(true);
    expect(clearsDebt(plan, "b", "a", 10000)).toBe(false); // partial
    expect(clearsDebt(plan, "a", "b", 30000)).toBe(false); // wrong direction
  });
});

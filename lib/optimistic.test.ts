import { describe, expect, it } from "vitest";
import { applyDelta, compareExpenses, expenseDelta, removeById, replaceTemp, settlementDelta, tempId, upsertById } from "./optimistic";
import { createPendingRegistry, PENDING_GRACE_MS } from "./realtime/pending";

const balances = [
  { member_id: "a", paid: 0, owed: 0, net: 0 },
  { member_id: "b", paid: 0, owed: 0, net: 0 },
  { member_id: "c", paid: 0, owed: 0, net: 0 },
];

describe("optimistic balances", () => {
  it("an expense moves payers up and splitters down, summing to zero", () => {
    const d = expenseDelta([{ member_id: "a", amount_base: 900 }], ["a", "b", "c"].map((m) => ({ member_id: m, amount_base: 300 })));
    const next = applyDelta(balances, d);
    expect(next.map((b) => b.net)).toEqual([600, -300, -300]);
    expect(next.reduce((s, b) => s + b.net, 0)).toBe(0);
    expect(applyDelta(next, d, -1)).toEqual(balances); // delete = exact inverse
  });

  it("a settlement: payer up, receiver down", () => {
    const after = applyDelta([{ member_id: "a", paid: 900, owed: 300, net: 600 }, { member_id: "b", paid: 0, owed: 300, net: -300 }], settlementDelta("b", "a", 300));
    expect(after.map((b) => b.net)).toEqual([300, 0]);
  });

  it("an edit is remove-old + add-new", () => {
    const oldD = expenseDelta([{ member_id: "a", amount_base: 900 }], [{ member_id: "b", amount_base: 900 }]);
    const newD = expenseDelta([{ member_id: "a", amount_base: 1200 }], [{ member_id: "b", amount_base: 600 }, { member_id: "c", amount_base: 600 }]);
    const start = applyDelta(balances, oldD);
    expect(applyDelta(applyDelta(start, oldD, -1), newD).map((b) => b.net)).toEqual([1200, -600, -600]);
  });
});

describe("list helpers", () => {
  const e = (id: string, date: string, created_at: string) => ({ id, date, created_at });

  it("upserts in newest-first order and removes by id", () => {
    let list = [e("1", "2026-10-01", "1"), e("2", "2026-09-01", "2")];
    list = upsertById(list, e("3", "2026-10-02", "3"), compareExpenses);
    expect(list.map((x) => x.id)).toEqual(["3", "1", "2"]);
    expect(removeById(list, "1").map((x) => x.id)).toEqual(["3", "2"]);
  });

  it("swaps the optimistic row for the server row in place, without duplicates", () => {
    const t = tempId("c1");
    const list = [e("x", "d", "1"), e(t, "d", "2"), e("y", "d", "3")];
    expect(replaceTemp(list, t, e("real", "d", "2")).map((x) => x.id)).toEqual(["x", "real", "y"]);
    // realtime refetch already brought the real row in: still only once
    expect(replaceTemp([...list, e("real", "d", "2")], t, e("real", "d", "2")).map((x) => x.id)).toEqual(["x", "real", "y"]);
    expect(replaceTemp(list, t, null).map((x) => x.id)).toEqual(["x", "y"]);
  });
});

describe("pending writes registry", () => {
  it("matches my writes while in flight and for a grace period after", () => {
    let t = 0;
    const r = createPendingRegistry(() => t);
    r.start("client-1", "expense-9");
    expect(r.has("client-1")).toBe(true);
    expect(r.has(null, "expense-9")).toBe(true);
    expect(r.has("someone-else")).toBe(false);
    t = 60_000;
    expect(r.has("client-1")).toBe(true); // still in flight: never expires
    r.finish("client-1", "expense-9");
    t += PENDING_GRACE_MS - 1;
    expect(r.has("client-1")).toBe(true);
    t += 2;
    expect(r.has("client-1")).toBe(false);
    expect(r.size()).toBe(0);
  });
});

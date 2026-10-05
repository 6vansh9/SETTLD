import { describe, expect, it } from "vitest";
import {
  allocate,
  chargeAmount,
  computeBill,
  finalizeBlocker,
  finalSplits,
  normalizeRoomCode,
  NO_CHARGES,
  parsePercentBp,
  type RoomCharges,
  type RoomClaim,
  type RoomItem,
} from "./splitRoom";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const item = (id: string, price: number, qty = 1): RoomItem => ({ id, name: id, price, qty });
const claim = (itemId: string, memberId: string, shares = 1): RoomClaim => ({ itemId, memberId, shares });
const pct = (bp: number) => ({ kind: "percent" as const, value: bp });
const amt = (v: number) => ({ kind: "amount" as const, value: v });

describe("allocate (largest remainder)", () => {
  it("splits exactly, extra units to the biggest remainders", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10, [1, 2])).toEqual([3, 7]);
    // 1000 × [1,1,1,1,1,1,1] → 142.857 each: 6 extra units go to the first six (ties → earlier).
    expect(allocate(1000, [1, 1, 1, 1, 1, 1, 1])).toEqual([143, 143, 143, 143, 143, 143, 142]);
    // remainders differ: 7 over weights [1, 3] → 1.75 / 5.25 → base 1,5; leftover 1 to the 0.75.
    expect(allocate(7, [1, 3])).toEqual([2, 5]);
  });
  it("gives zero weights nothing and handles zero totals", () => {
    expect(allocate(5, [0, 1, 0])).toEqual([0, 5, 0]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocate(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocate(5, [0, 0])).toThrow();
    expect(() => allocate(-1, [1])).toThrow();
    expect(() => allocate(1.5, [1])).toThrow();
  });
  it("works beyond 2^53 intermediate products", () => {
    const r = allocate(9_000_000_000_000, [999_999_999, 1, 7]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(9_000_000_000_000);
  });
});

describe("chargeAmount", () => {
  it("percent of the subtotal, rounded half up; or a fixed amount", () => {
    expect(chargeAmount(pct(1800), 100000)).toBe(18000);
    expect(chargeAmount(pct(1800), 12345)).toBe(2222); // 2222.1
    expect(chargeAmount(pct(500), 10)).toBe(1); // 0.5 → 1
    expect(chargeAmount(pct(0), 99999)).toBe(0);
    expect(chargeAmount(amt(5000), 1)).toBe(5000);
  });
});

describe("computeBill", () => {
  it("splits a shared item equally and an unshared one to its owner", () => {
    const bill = computeBill([item("pizza", 60000), item("beer", 30000, 2)], [claim("pizza", A), claim("pizza", B), claim("beer", B)], NO_CHARGES);
    expect(bill.subtotal).toBe(120000);
    expect(bill.people.map((p) => [p.memberId, p.total])).toEqual([
      [A, 30000],
      [B, 90000],
    ]);
    expect(bill.unclaimed).toEqual([]);
  });

  it("custom shares", () => {
    const bill = computeBill([item("wine", 10000)], [claim("wine", A, 2), claim("wine", B, 1)], NO_CHARGES);
    expect(bill.people.map((p) => p.total)).toEqual([6667, 3333]);
  });

  it("spreads tax and tip in proportion to item subtotals, exact to the paisa", () => {
    const bill = computeBill(
      [item("a", 33333), item("b", 33333), item("c", 33334)],
      [claim("a", A), claim("b", B), claim("c", C)],
      { tax: pct(1800), service: pct(0), tip: pct(1000) },
    );
    expect(bill.tax).toBe(18000);
    expect(bill.tip).toBe(10000);
    expect(bill.total).toBe(128000);
    expect(bill.people.reduce((a, p) => a + p.total, 0)).toBe(128000);
    expect(bill.people.map((p) => p.tax)).toEqual([6000, 6000, 6000]);
  });

  it("a fixed service charge is spread the same way", () => {
    const bill = computeBill([item("x", 100), item("y", 200)], [claim("x", A), claim("y", B)], { ...NO_CHARGES, service: amt(100) });
    expect(bill.people.map((p) => p.service)).toEqual([33, 67]);
  });

  it("ignores un-claims (shares 0) and claims on items no longer in the room", () => {
    const bill = computeBill([item("x", 100)], [claim("x", A, 0), claim("gone", B)], NO_CHARGES);
    expect(bill.people).toEqual([]);
    expect(bill.unclaimed).toEqual(["x"]);
    expect(bill.unclaimedSubtotal).toBe(100);
  });

  it("keeps your share of tax stable while others haven't claimed yet", () => {
    const items = [item("x", 10000), item("y", 10000)];
    const partial = computeBill(items, [claim("x", A)], { ...NO_CHARGES, tax: pct(1000) });
    const full = computeBill(items, [claim("x", A), claim("y", B)], { ...NO_CHARGES, tax: pct(1000) });
    expect(partial.people[0].tax).toBe(1000);
    expect(full.people[0].tax).toBe(1000);
  });

  it("finalSplits drops zero totals; blocker explains what's missing", () => {
    const items = [item("crumb", 1), item("x", 100)];
    const bill = computeBill(items, [claim("crumb", A), claim("crumb", B), claim("x", A)], NO_CHARGES);
    expect(finalSplits(bill)).toEqual([{ member_id: A, amount: 101 }]);
    expect(finalizeBlocker(items, bill)).toBeNull();
    expect(finalizeBlocker([], computeBill([], [], NO_CHARGES))).toBe("Add an item first");
    const two = computeBill([item("p", 1), item("q", 1), item("r", 1)], [claim("p", A)], NO_CHARGES);
    expect(finalizeBlocker([item("p", 1), item("q", 1), item("r", 1)], two)).toBe("2 items unclaimed");
  });
});

describe("codes and inputs", () => {
  it("room codes are 6 unambiguous characters", () => {
    expect(normalizeRoomCode(" ab3k9z ")).toBe("AB3K9Z");
    expect(normalizeRoomCode("AB0K9Z")).toBeNull();
    expect(normalizeRoomCode("ABOK9Z")).toBeNull();
    expect(normalizeRoomCode("AB1K9Z")).toBeNull();
    expect(normalizeRoomCode("ABIK9Z")).toBeNull();
    expect(normalizeRoomCode("ABCDE")).toBeNull();
  });
  it("percent input → basis points", () => {
    expect(parsePercentBp("18")).toBe(1800);
    expect(parsePercentBp("12.5%")).toBe(1250);
    expect(parsePercentBp("0.25")).toBe(25);
    expect(parsePercentBp("100")).toBe(10000);
    expect(parsePercentBp("100.01")).toBeNull();
    expect(parsePercentBp("1.234")).toBeNull();
    expect(parsePercentBp("abc")).toBeNull();
  });
});

/** Deterministic PRNG so failures reproduce. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRoom(seed: number) {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const members = Array.from({ length: int(1, 8) }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
  const big = r() < 0.1;
  const items: RoomItem[] = Array.from({ length: int(1, 15) }, (_, i) => ({
    id: `i${i}`,
    name: `item ${i}`,
    price: big ? int(1, 5_000_000_00) : int(1, 300000),
    qty: r() < 0.7 ? 1 : int(1, 12),
  }));
  const claims: RoomClaim[] = [];
  for (const it of items) {
    const who = members.filter(() => r() < 0.4);
    if (who.length === 0) who.push(members[int(0, members.length - 1)]);
    for (const m of who) claims.push({ itemId: it.id, memberId: m, shares: r() < 0.7 ? 1 : int(1, 5) });
  }
  const charge = () => (r() < 0.3 ? { kind: "amount" as const, value: int(0, 50000) } : { kind: "percent" as const, value: int(0, 3000) });
  const charges: RoomCharges = { tax: charge(), service: charge(), tip: charge() };
  return { members, items, claims, charges };
}

describe("property: random rooms", () => {
  it("person totals always sum exactly to the bill, items and charges allocate exactly", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const { items, claims, charges } = randomRoom(seed);
      const bill = computeBill(items, claims, charges);
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      expect(bill.unclaimed).toEqual([]);
      expect(sum(bill.people.map((p) => p.total))).toBe(bill.total);
      expect(sum(bill.people.map((p) => p.items))).toBe(bill.subtotal);
      for (const k of ["tax", "service", "tip"] as const) expect(sum(bill.people.map((p) => p[k]))).toBe(bill[k]);
      for (const it of items) {
        const got = sum(bill.people.flatMap((p) => p.lines.filter((l) => l.itemId === it.id).map((l) => l.amount)));
        expect(got).toBe(it.price * it.qty);
      }
      // What finalize writes: exact splits summing to the expense amount.
      const splits = finalSplits(bill);
      expect(sum(splits.map((s) => s.amount))).toBe(bill.total);
      expect(splits.every((s) => Number.isSafeInteger(s.amount) && s.amount > 0)).toBe(true);
      // Each person's charge share is within one unit of the exact proportion.
      for (const p of bill.people) {
        const exact = (bill.tax * p.items) / bill.subtotal;
        expect(Math.abs(p.tax - exact)).toBeLessThan(1);
      }
    }
  });
});

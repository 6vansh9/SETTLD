import { describe, expect, it } from "vitest";
import {
  CURRENCY_CODES,
  allocateToBase,
  computeSplits,
  convertMinor,
  parseRate,
  splitEqual,
  SPLIT_TYPES,
  type CurrencyCode,
  type SplitType,
} from "./money";
import {
  applyTransfers,
  computeBalances,
  pairwiseDebts,
  simplifyDebts,
  type ExpenseShape,
  type SettlementShape,
} from "./simplify";

const allZero = (bs: { net: number }[]) => bs.every((b) => b.net === 0);

describe("simplifyDebts", () => {
  it("matches the largest creditor with the largest debtor", () => {
    const t = simplifyDebts([
      { memberId: "a", net: 6000 },
      { memberId: "b", net: -4000 },
      { memberId: "c", net: -2000 },
    ]);
    expect(t).toEqual([
      { from: "b", to: "a", amount: 4000 },
      { from: "c", to: "a", amount: 2000 },
    ]);
  });

  it("collapses a chain a→b→c into one payment", () => {
    // a owes b 100, b owes c 100 ⇒ a pays c 100
    expect(simplifyDebts([{ memberId: "a", net: -100 }, { memberId: "b", net: 0 }, { memberId: "c", net: 100 }])).toEqual([
      { from: "a", to: "c", amount: 100 },
    ]);
  });

  it("returns nothing when everyone is square", () => {
    expect(simplifyDebts([{ memberId: "a", net: 0 }])).toEqual([]);
    expect(simplifyDebts([])).toEqual([]);
  });

  it("refuses balances that don't sum to zero", () => {
    expect(() => simplifyDebts([{ memberId: "a", net: 1 }])).toThrow(RangeError);
  });
});

describe("pairwiseDebts", () => {
  it("nets debts per pair", () => {
    const expenses: ExpenseShape[] = [
      // a paid 300 for a, b, c
      { payers: [{ memberId: "a", amount: 300 }], splits: [{ memberId: "a", amount: 100 }, { memberId: "b", amount: 100 }, { memberId: "c", amount: 100 }] },
      // b paid 60 for a, b
      { payers: [{ memberId: "b", amount: 60 }], splits: [{ memberId: "a", amount: 30 }, { memberId: "b", amount: 30 }] },
    ];
    expect(pairwiseDebts(expenses)).toEqual([
      { from: "c", to: "a", amount: 100 },
      { from: "b", to: "a", amount: 70 },
    ]);
  });

  it("splits a share across several payers by what they paid", () => {
    const t = pairwiseDebts([
      { payers: [{ memberId: "a", amount: 75 }, { memberId: "b", amount: 25 }], splits: [{ memberId: "c", amount: 100 }] },
    ]);
    expect(t).toEqual([
      { from: "c", to: "a", amount: 75 },
      { from: "c", to: "b", amount: 25 },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Property test (PRD acceptance: 1,000 random expenses across all split types)
// ---------------------------------------------------------------------------------------------

/** Small seeded PRNG so failures are reproducible. */
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

function randomExpense(rand: () => number, members: string[]): ExpenseShape & { total: number; type: SplitType } {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T,>(xs: T[], k: number) => [...xs].sort(() => rand() - 0.5).slice(0, k);
  // Mostly everyday amounts, sometimes ₹0.01-ish, sometimes huge.
  const total = rand() < 0.1 ? int(1, 50) : rand() < 0.95 ? int(100, 5_000_000) : int(1, 9_000_000_000_000);
  const type = SPLIT_TYPES[int(0, 3)];
  const included = members.filter((m) => members.indexOf(m) === 0 || rand() < 0.75); // ≥ 1 person

  let inputs: { memberId: string; value?: number }[];
  if (type === "equal") inputs = included.map((m) => ({ memberId: m }));
  else if (type === "exact") {
    const parts = splitEqual(total, included.length);
    const shuffled = parts.map((p, i) => (i === 0 ? p : p)); // equal-ish base
    // move some paise around so exact amounts are uneven but still sum to total
    if (included.length > 1) {
      const move = Math.min(shuffled[1], int(0, shuffled[1]));
      shuffled[0] += move;
      shuffled[1] -= move;
    }
    inputs = included.map((m, i) => ({ memberId: m, value: shuffled[i] }));
  } else if (type === "percent") {
    const bps = splitEqual(10_000, included.length);
    if (included.length > 1) {
      const move = int(0, bps[1]);
      bps[0] += move;
      bps[1] -= move;
    }
    inputs = included.map((m, i) => ({ memberId: m, value: bps[i] }));
  } else inputs = included.map((m) => ({ memberId: m, value: int(0, 5) })).map((x, i) => (i === 0 ? { ...x, value: Math.max(1, x.value!) } : x));

  const r = computeSplits(total, type, inputs);
  if (!r.ok) throw new Error(`generator produced an invalid ${type} split: ${r.error}`);

  const payerCount = int(1, Math.min(3, members.length));
  const payerIds = pick(members, payerCount);
  const paid = splitEqual(total, payerCount);
  if (payerCount > 1) {
    const move = int(0, paid[1]);
    paid[0] += move;
    paid[1] -= move;
  }
  const payers = payerIds.map((memberId, i) => ({ memberId, amount: paid[i] })).filter((p) => p.amount > 0);
  return { total, type, payers, splits: r.splits.map(({ memberId, amount }) => ({ memberId, amount })) };
}

describe("property: 1,000 random expenses", () => {
  it("splits sum to totals, balances sum to zero, settlement plans are exact and small", () => {
    const rand = rng(20261004);
    const seenTypes = new Set<SplitType>();
    let multiPayer = 0;
    let groupsChecked = 0;
    let expensesChecked = 0;

    while (expensesChecked < 1000) {
      const members = Array.from({ length: 2 + Math.floor(rand() * 11) }, (_, i) => `m${i}`); // 2–12 people
      const expenses = Array.from({ length: 1 + Math.floor(rand() * 40) }, () => randomExpense(rand, members));
      for (const e of expenses) {
        seenTypes.add(e.type);
        if (e.payers.length > 1) multiPayer++;
        expect(e.splits.reduce((a, s) => a + s.amount, 0)).toBe(e.total);
        expect(e.payers.reduce((a, p) => a + p.amount, 0)).toBe(e.total);
        expect(e.splits.every((s) => Number.isSafeInteger(s.amount) && s.amount >= 0)).toBe(true);
      }
      expensesChecked += expenses.length;
      groupsChecked++;

      const balances = computeBalances(expenses, members);
      expect(balances.reduce((a, b) => a + b.net, 0)).toBe(0);

      const simplified = simplifyDebts(balances);
      const n = balances.filter((b) => b.net !== 0).length;
      expect(simplified.length).toBeLessThanOrEqual(Math.max(0, n - 1));
      expect(simplified.length).toBeLessThanOrEqual(members.length - 1);
      expect(simplified.every((t) => t.amount > 0 && t.from !== t.to)).toBe(true);
      expect(allZero(applyTransfers(balances, simplified))).toBe(true);

      const raw = pairwiseDebts(expenses);
      expect(raw.every((t) => t.amount > 0 && t.from !== t.to)).toBe(true);
      expect(allZero(applyTransfers(balances, raw))).toBe(true);
    }

    expect(expensesChecked).toBeGreaterThanOrEqual(1000);
    expect([...seenTypes].sort()).toEqual(["equal", "exact", "percent", "shares"]);
    expect(multiPayer).toBeGreaterThan(50);
    expect(groupsChecked).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------------------------
// Property test, Milestone 5: random currencies + rates and settlements (incl. disputed ones)
// ---------------------------------------------------------------------------------------------

describe("settlements", () => {
  it("count like a payment: sent adds, received subtracts", () => {
    const b = computeBalances(
      [{ payers: [{ memberId: "a", amount: 1000 }], splits: [{ memberId: "a", amount: 500 }, { memberId: "b", amount: 500 }] }],
      ["a", "b"],
      [{ from: "b", to: "a", amount: 500 }],
    );
    expect(b).toEqual([{ memberId: "a", net: 0 }, { memberId: "b", net: 0 }]);
  });

  it("raw debts net out against settlements", () => {
    const e: ExpenseShape[] = [{ payers: [{ memberId: "a", amount: 1000 }], splits: [{ memberId: "b", amount: 1000 }] }];
    expect(pairwiseDebts(e, [{ from: "b", to: "a", amount: 400 }])).toEqual([{ from: "b", to: "a", amount: 600 }]);
    expect(pairwiseDebts(e, [{ from: "b", to: "a", amount: 1000 }])).toEqual([]);
  });
});

describe("property: multi-currency expenses + settlements", () => {
  it("base-currency balances sum to zero and every plan settles exactly", () => {
    const rand = rng(5_2026_10_04);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    // Realistic-ish spot rates into each base, plus extreme ones to stress rounding.
    const rates = ["1", "96.32", "0.89087", "1.5321", "0.0104", "112.98765", "0.0000123", "250000.5"];
    let expensesChecked = 0;
    let foreign = 0;
    let settlementsCounted = 0;
    let disputedSkipped = 0;
    let tooLarge = 0;

    while (expensesChecked < 1000) {
      const base: CurrencyCode = CURRENCY_CODES[int(0, 4)];
      const members = Array.from({ length: int(2, 12) }, (_, i) => `m${i}`);
      const expenses: ExpenseShape[] = [];

      for (let k = int(1, 30); k > 0; k--) {
        const generated = randomExpense(rand, members); // splits/payers in the expense currency
        const currency: CurrencyCode = rand() < 0.5 ? base : CURRENCY_CODES[int(0, 4)];
        const rate = parseRate(currency === base ? "1" : rates[int(1, rates.length - 1)])!;
        let amountBase: number;
        try {
          amountBase = convertMinor(generated.total, rate);
        } catch {
          tooLarge++; // e.g. $90bn at 250,000: refused, never silently imprecise
          continue;
        }
        if (amountBase === 0) continue; // the server rejects expenses that convert to 0 (amount_base > 0)
        if (currency !== base) foreign++;

        const splitsBase = allocateToBase(generated.splits.map((s) => s.amount), amountBase);
        const payersBase = allocateToBase(generated.payers.map((p) => p.amount), amountBase);
        const e: ExpenseShape = {
          splits: generated.splits.map((s, i) => ({ memberId: s.memberId, amount: splitsBase[i] })),
          payers: generated.payers.map((p, i) => ({ memberId: p.memberId, amount: payersBase[i] })).filter((p) => p.amount > 0),
        };
        expect(e.splits.reduce((a, s) => a + s.amount, 0)).toBe(amountBase);
        expect(e.payers.reduce((a, p) => a + p.amount, 0)).toBe(amountBase);
        expenses.push(e);
        expensesChecked++;
      }

      // Partial settlements along the simplified plan; some get disputed (and so don't count).
      const plan = simplifyDebts(computeBalances(expenses, members));
      const settlements: SettlementShape[] = [];
      for (const t of plan) {
        if (rand() < 0.4) continue;
        const s = { from: t.from, to: t.to, amount: rand() < 0.5 ? t.amount : int(1, t.amount) };
        if (rand() < 0.15) disputedSkipped++;
        else {
          settlements.push(s);
          settlementsCounted++;
        }
      }

      const balances = computeBalances(expenses, members, settlements);
      expect(balances.reduce((a, b) => a + b.net, 0)).toBe(0);

      const simplified = simplifyDebts(balances);
      expect(simplified.length).toBeLessThanOrEqual(Math.max(0, balances.filter((b) => b.net !== 0).length - 1));
      expect(allZero(applyTransfers(balances, simplified))).toBe(true);
      expect(allZero(applyTransfers(balances, pairwiseDebts(expenses, settlements)))).toBe(true);
    }

    expect(foreign).toBeGreaterThan(300);
    expect(settlementsCounted).toBeGreaterThan(50);
    expect(disputedSkipped).toBeGreaterThan(5);
    expect(tooLarge).toBeLessThan(expensesChecked / 10);
  });
});

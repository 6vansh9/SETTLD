import type { MemberAmount } from "@/lib/money";

/** Net balance per member in minor units: positive = is owed money, negative = owes. */
export interface Balance {
  memberId: string;
  net: number;
}

/** "from pays to `amount`" (minor units, always > 0). */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface ExpenseShape {
  payers: readonly MemberAmount[];
  splits: readonly MemberAmount[];
}

/** A payment between members, in base-currency minor units. Disputed ones must be left out by the caller. */
export interface SettlementShape {
  from: string;
  to: string;
  amount: number;
}

/**
 * A settlement moves balances exactly like an expense the payer covered entirely for the receiver:
 * the payer's net goes up (sent adds), the receiver's goes down (received subtracts).
 */
export function settlementAsExpense(s: SettlementShape): ExpenseShape {
  return { payers: [{ memberId: s.from, amount: s.amount }], splits: [{ memberId: s.to, amount: s.amount }] };
}

/**
 * Net = paid − owed + settlements sent − settlements received, per member.
 * Mirrors the group_balances view; the database is the source of truth, this is for tests and
 * previews. Members are returned in the order given, plus any extra ids found on expenses.
 */
export function computeBalances(
  expenses: readonly ExpenseShape[],
  memberIds: readonly string[] = [],
  settlements: readonly SettlementShape[] = [],
): Balance[] {
  const net = new Map<string, number>(memberIds.map((id) => [id, 0]));
  for (const e of [...expenses, ...settlements.map(settlementAsExpense)]) {
    for (const p of e.payers) net.set(p.memberId, (net.get(p.memberId) ?? 0) + p.amount);
    for (const s of e.splits) net.set(s.memberId, (net.get(s.memberId) ?? 0) - s.amount);
  }
  return [...net].map(([memberId, n]) => ({ memberId, net: n }));
}

function assertZeroSum(balances: readonly Balance[]) {
  const sum = balances.reduce((a, b) => a + b.net, 0);
  if (sum !== 0) throw new RangeError(`Balances must sum to zero, got ${sum}`);
}

/**
 * Simplify debts (PRD › Balances): repeatedly match the largest creditor with the largest
 * debtor and transfer the smaller of the two amounts. Every step zeroes at least one person
 * and the last step zeroes two, so there are at most n − 1 transfers.
 * Ties break by the order balances were given, so the result is deterministic.
 */
export function simplifyDebts(balances: readonly Balance[]): Transfer[] {
  assertZeroSum(balances);
  const order = new Map(balances.map((b, i) => [b.memberId, i]));
  const creditors = balances.filter((b) => b.net > 0).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.net < 0).map((b) => ({ memberId: b.memberId, net: -b.net }));
  const byLargest = (a: Balance, b: Balance) => b.net - a.net || order.get(a.memberId)! - order.get(b.memberId)!;

  const transfers: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byLargest);
    debtors.sort(byLargest);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.net, d.net);
    transfers.push({ from: d.memberId, to: c.memberId, amount });
    c.net -= amount;
    d.net -= amount;
    if (c.net === 0) creditors.shift();
    if (d.net === 0) debtors.shift();
  }
  return transfers;
}

/**
 * Raw pairwise debts for when simplify is off: who owes whom from the expenses themselves,
 * netted per pair. Exact in integers, with no rounding:
 *   1. what you paid first covers your own share;
 *   2. the rest of each person's share is matched against the payers' remaining credit,
 *      in a stable order (people in split order, payers in payer order).
 * With a single payer (the usual case) this is simply "everyone owes the payer their share".
 */
export function pairwiseDebts(expenses: readonly ExpenseShape[], settlements: readonly SettlementShape[] = []): Transfer[] {
  // owed.get(a).get(b) = how much a owes b
  const owed = new Map<string, Map<string, number>>();
  const add = (from: string, to: string, amount: number) => {
    if (from === to || amount === 0) return;
    const row = owed.get(from) ?? new Map<string, number>();
    row.set(to, (row.get(to) ?? 0) + amount);
    owed.set(from, row);
  };

  for (const e of [...expenses, ...settlements.map(settlementAsExpense)]) {
    const paid = new Map<string, number>();
    for (const p of e.payers) paid.set(p.memberId, (paid.get(p.memberId) ?? 0) + p.amount);
    const share = new Map<string, number>();
    for (const s of e.splits) share.set(s.memberId, (share.get(s.memberId) ?? 0) + s.amount);

    const debtors = [...share].map(([id, amt]) => ({ id, left: amt - Math.min(amt, paid.get(id) ?? 0) })).filter((d) => d.left > 0);
    const creditors = [...paid].map(([id, amt]) => ({ id, left: amt - Math.min(amt, share.get(id) ?? 0) })).filter((c) => c.left > 0);

    let ci = 0;
    for (const d of debtors) {
      while (d.left > 0 && ci < creditors.length) {
        const c = creditors[ci];
        const amount = Math.min(d.left, c.left);
        add(d.id, c.id, amount);
        d.left -= amount;
        c.left -= amount;
        if (c.left === 0) ci++;
      }
    }
  }

  const seen = new Set<string>();
  const transfers: Transfer[] = [];
  for (const [a, row] of owed) {
    for (const b of row.keys()) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const net = (owed.get(a)?.get(b) ?? 0) - (owed.get(b)?.get(a) ?? 0);
      if (net > 0) transfers.push({ from: a, to: b, amount: net });
      else if (net < 0) transfers.push({ from: b, to: a, amount: -net });
    }
  }
  return transfers.sort((x, y) => y.amount - x.amount || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
}

/** Apply transfers to balances (paying a debt moves the payer toward zero). Used to verify settlement plans. */
export function applyTransfers(balances: readonly Balance[], transfers: readonly Transfer[]): Balance[] {
  const net = new Map(balances.map((b) => [b.memberId, b.net]));
  for (const t of transfers) {
    net.set(t.from, (net.get(t.from) ?? 0) + t.amount);
    net.set(t.to, (net.get(t.to) ?? 0) - t.amount);
  }
  return [...net].map(([memberId, n]) => ({ memberId, net: n }));
}

/**
 * Optimistic cache helpers (PRD › Realtime: "TanStack Query updates the cache immediately…").
 * Pure; tested in optimistic.test.ts. Balances are adjusted locally only as an instant preview;
 * the group_balances view is always refetched afterwards and replaces them.
 */

export interface BalanceRow {
  member_id: string;
  paid: number;
  owed: number;
  net: number;
}

export type Delta = Map<string, { paid: number; owed: number }>;

/** How an expense moves each member: payers paid, splitters owe (base-currency lines). */
export function expenseDelta(
  payers: readonly { member_id: string; amount_base: number }[],
  splits: readonly { member_id: string; amount_base: number }[],
): Delta {
  const d: Delta = new Map();
  const get = (id: string) => d.get(id) ?? { paid: 0, owed: 0 };
  for (const p of payers) d.set(p.member_id, { ...get(p.member_id), paid: get(p.member_id).paid + p.amount_base });
  for (const s of splits) d.set(s.member_id, { ...get(s.member_id), owed: get(s.member_id).owed + s.amount_base });
  return d;
}

/** A counted settlement moves the payer up and the receiver down (like the view's sent/received). */
export function settlementDelta(from: string, to: string, amountBase: number): Delta {
  return new Map([
    [from, { paid: amountBase, owed: 0 }],
    [to, { paid: 0, owed: amountBase }],
  ]);
}

/** Apply a delta (sign = 1 to add, −1 to remove). Members without a row are left alone. */
export function applyDelta<T extends BalanceRow>(balances: readonly T[], delta: Delta, sign: 1 | -1 = 1): T[] {
  return balances.map((b) => {
    const d = delta.get(b.member_id);
    if (!d) return b;
    const paid = b.paid + sign * d.paid;
    const owed = b.owed + sign * d.owed;
    return { ...b, paid, owed, net: b.net + sign * (d.paid - d.owed) };
  });
}

export const tempId = (clientId: string) => `temp-${clientId}`;
export const isTempId = (id: string) => id.startsWith("temp-");

/** Insert or replace by id, keeping the list sorted with `compare`. */
export function upsertById<T extends { id: string }>(list: readonly T[] | undefined, row: T, compare?: (a: T, b: T) => number): T[] {
  const next = (list ?? []).filter((x) => x.id !== row.id);
  next.push(row);
  return compare ? next.sort(compare) : next;
}

export function removeById<T extends { id: string }>(list: readonly T[] | undefined, id: string): T[] {
  return (list ?? []).filter((x) => x.id !== id);
}

/** Swap the optimistic placeholder for the server's row (or just drop it if the row isn't available). */
export function replaceTemp<T extends { id: string }>(list: readonly T[] | undefined, temp: string, row: T | null): T[] {
  const without = (list ?? []).filter((x) => x.id !== temp && (!row || x.id !== row.id));
  if (!row) return without;
  const at = (list ?? []).findIndex((x) => x.id === temp);
  const next = [...without];
  next.splice(at < 0 ? 0 : Math.min(at, next.length), 0, row);
  return next;
}

/** Expenses newest first: by date, then creation time (same order as the server query). */
export function compareExpenses(a: { date: string; created_at: string }, b: { date: string; created_at: string }) {
  return b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at);
}

export function compareNewestFirst(a: { created_at: string }, b: { created_at: string }) {
  return b.created_at.localeCompare(a.created_at);
}

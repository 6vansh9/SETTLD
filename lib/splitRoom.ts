/**
 * Split Room money maths (PRD › Headline features › Split Room). Pure, integer minor units.
 *
 * Mirrors `public.room_allocate` / `public.room_totals` in supabase/migrations/0007_split_rooms.sql
 * exactly (same ordering, same rounding) so the live totals on every phone equal the expense
 * finalize creates. Change one, change both, and re-run the parity check.
 *
 *  • An item's cost (price × qty) splits between its claimants by shares (largest remainder).
 *  • Tax, service charge and tip are each a percentage (basis points, of the item subtotal) or a
 *    fixed amount, and each is spread over people in proportion to their item subtotal
 *    (largest remainder), so the grand total is exact to the paisa.
 *  • Ties in largest remainder go to the earlier entry; people are always ordered by member id.
 */

export type ChargeKind = "percent" | "amount";
export interface Charge {
  kind: ChargeKind;
  /** Basis points for percent (1800 = 18%), minor units for amount. */
  value: number;
}
export interface RoomCharges {
  tax: Charge;
  service: Charge;
  tip: Charge;
}
export const CHARGE_KEYS = ["tax", "service", "tip"] as const;
export type ChargeKey = (typeof CHARGE_KEYS)[number];
export const NO_CHARGES: RoomCharges = {
  tax: { kind: "percent", value: 0 },
  service: { kind: "percent", value: 0 },
  tip: { kind: "percent", value: 0 },
};

export interface RoomItem {
  id: string;
  name: string;
  /** Unit price, minor units, > 0. */
  price: number;
  qty: number;
}
export interface RoomClaim {
  itemId: string;
  memberId: string;
  /** 0 = not claimed (claims are never hard-deleted, so realtime sees un-taps). */
  shares: number;
}

export interface PersonTotal {
  memberId: string;
  /** Item share per item id. */
  lines: { itemId: string; amount: number }[];
  items: number;
  tax: number;
  service: number;
  tip: number;
  total: number;
}
export interface RoomBill {
  subtotal: number;
  tax: number;
  service: number;
  tip: number;
  total: number;
  /** Everyone with at least one claim, ordered by member id. */
  people: PersonTotal[];
  /** Items nobody has claimed yet. */
  unclaimed: string[];
  /** Cost of the unclaimed items (its share of tax/service/tip isn't on anyone yet). */
  unclaimedSubtotal: number;
}

export const MAX_PERCENT_BP = 10000; // 100%
export const MAX_QTY = 999;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Plain code-point order (matches Postgres uuid ordering for lowercase uuids). */
export const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Largest-remainder allocation: floor(total × w / W) each, then one more unit to the biggest
 * remainders (earlier index wins ties). Sums to `total` exactly. Zero weights get zero.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError(`Bad total ${total}`);
  weights.forEach((w) => {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`Bad weight ${w}`);
  });
  const W = weights.reduce((a, w) => a + BigInt(w), BigInt(0));
  if (W === BigInt(0)) {
    if (total === 0) return weights.map(() => 0);
    throw new RangeError("Nothing to allocate over");
  }
  const t = BigInt(total);
  const base = weights.map((w) => (t * BigInt(w)) / W);
  const rem = weights.map((w) => (t * BigInt(w)) % W);
  let left = Number(t - base.reduce((a, b) => a + b, BigInt(0)));
  const order = weights
    .map((w, i) => ({ i, r: rem[i], w }))
    .filter((x) => x.w > 0)
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (left <= 0) break;
    base[i] += BigInt(1);
    left--;
  }
  return base.map(Number);
}

/** A charge in minor units: percent of the item subtotal rounded half up, or the fixed amount. */
export function chargeAmount(c: Charge, subtotal: number): number {
  if (c.kind === "amount") return c.value;
  return Number((BigInt(subtotal) * BigInt(c.value) + BigInt(5000)) / BigInt(10000));
}

export function itemCost(i: Pick<RoomItem, "price" | "qty">): number {
  return i.price * i.qty;
}

/** The whole bill and every claimant's total. Never throws on well-formed integer input. */
export function computeBill(items: readonly RoomItem[], claims: readonly RoomClaim[], charges: RoomCharges): RoomBill {
  const live = claims.filter((c) => c.shares > 0);
  const itemIds = new Set(items.map((i) => i.id));
  const people = [...new Set(live.filter((c) => itemIds.has(c.itemId)).map((c) => c.memberId))].sort(byId);
  const idx = new Map(people.map((m, i) => [m, i]));
  const itemTotals = people.map(() => 0);
  const lines: { itemId: string; amount: number }[][] = people.map(() => []);
  const unclaimed: string[] = [];
  let subtotal = BigInt(0);
  let unclaimedSubtotal = 0;

  for (const item of items) {
    const cost = itemCost(item);
    subtotal += BigInt(cost);
    const cs = live.filter((c) => c.itemId === item.id).sort((a, b) => byId(a.memberId, b.memberId));
    if (cs.length === 0) {
      unclaimed.push(item.id);
      unclaimedSubtotal += cost;
      continue;
    }
    const parts = allocate(cost, cs.map((c) => c.shares));
    cs.forEach((c, k) => {
      const p = idx.get(c.memberId)!;
      itemTotals[p] += parts[k];
      lines[p].push({ itemId: item.id, amount: parts[k] });
    });
  }
  if (subtotal > MAX_SAFE) throw new RangeError("Bill too large");
  const sub = Number(subtotal);

  // Unclaimed items hold their own slice of each charge (last, so they never win a tie that
  // would otherwise go to a person): your share doesn't jump as others claim.
  const weights = unclaimedSubtotal > 0 ? [...itemTotals, unclaimedSubtotal] : itemTotals;
  const spread = (amount: number) => (weights.some((w) => w > 0) ? allocate(amount, weights) : weights.map(() => 0));

  const amounts = { tax: chargeAmount(charges.tax, sub), service: chargeAmount(charges.service, sub), tip: chargeAmount(charges.tip, sub) };
  const shares = { tax: spread(amounts.tax), service: spread(amounts.service), tip: spread(amounts.tip) };

  const out: PersonTotal[] = people.map((memberId, p) => {
    const t = { tax: shares.tax[p], service: shares.service[p], tip: shares.tip[p] };
    return { memberId, lines: lines[p], items: itemTotals[p], ...t, total: itemTotals[p] + t.tax + t.service + t.tip };
  });
  return {
    subtotal: sub,
    ...amounts,
    total: sub + amounts.tax + amounts.service + amounts.tip,
    people: out,
    unclaimed,
    unclaimedSubtotal,
  };
}

/** The exact splits finalize writes (zero totals dropped), ordered by member id. */
export function finalSplits(bill: RoomBill): { member_id: string; amount: number }[] {
  return bill.people.filter((p) => p.total > 0).map((p) => ({ member_id: p.memberId, amount: p.total }));
}

/** Why Finalize is disabled, or null when it can go. */
export function finalizeBlocker(items: readonly RoomItem[], bill: RoomBill): string | null {
  if (items.length === 0) return "Add an item first";
  const n = bill.unclaimed.length;
  if (n > 0) return `${n} ${n === 1 ? "item" : "items"} unclaimed`;
  if (bill.total <= 0) return "The bill is empty";
  return null;
}

/** Room codes: 6 characters, no 0/O/1/I. */
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{6}$/;
export function normalizeRoomCode(input: string): string | null {
  const c = input.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(c) ? c : null;
}

/** Parse "18" / "18.5" / "18.25" (%) into basis points; null if invalid or over 100%. */
export function parsePercentBp(input: string): number | null {
  const m = /^\s*(\d{1,3})(?:\.(\d{0,2}))?\s*%?\s*$/.exec(input);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp <= MAX_PERCENT_BP ? bp : null;
}

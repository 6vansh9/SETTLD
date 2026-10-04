import { convertMinor, parseRate, type CurrencyCode } from "@/lib/money";

interface GroupLike {
  id: string;
  base_currency: CurrencyCode;
  members: { id: string; user_id: string | null; left_at: string | null }[];
}

interface BalanceLike {
  group_id: string;
  member_id: string;
  net: number;
}

/** Your net in one group (0 if you're not in it). Positive = you're owed. */
export function myNetInGroup(group: GroupLike, balances: readonly BalanceLike[], userId: string): number {
  const me = group.members.find((m) => m.user_id === userId && !m.left_at);
  if (!me) return 0;
  return balances.find((b) => b.member_id === me.id)?.net ?? 0;
}

export interface OverallTotals {
  /** Sum of your nets in groups whose base currency is your default currency. */
  primary: number;
  /** Other currencies, kept separate until FX arrives (Milestone 5). Non-zero only, by currency. */
  others: { currency: CurrencyCode; net: number }[];
}

/**
 * Overall balance on Home. Exact per currency; nothing is converted yet (approved for M4:
 * one big number in your default currency, a line per other currency underneath).
 * Archived groups still count: money owed doesn't disappear when a group is archived.
 */
export function overallTotals(
  groups: readonly GroupLike[],
  balances: readonly BalanceLike[],
  userId: string,
  defaultCurrency: CurrencyCode,
): OverallTotals {
  const byCurrency = new Map<CurrencyCode, number>();
  for (const g of groups) {
    const net = myNetInGroup(g, balances.filter((b) => b.group_id === g.id), userId);
    byCurrency.set(g.base_currency, (byCurrency.get(g.base_currency) ?? 0) + net);
  }
  return {
    primary: byCurrency.get(defaultCurrency) ?? 0,
    others: [...byCurrency]
      .filter(([c, n]) => c !== defaultCurrency && n !== 0)
      .map(([currency, net]) => ({ currency, net }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}

/** How you stand on one expense: what you paid minus your share. */
export function myPositionOnExpense(
  e: { payers: { member_id: string; amount_base: number }[]; splits: { member_id: string; amount_base: number }[] },
  myMemberId: string | undefined,
): { involved: boolean; net: number } {
  if (!myMemberId) return { involved: false, net: 0 };
  const paid = e.payers.filter((p) => p.member_id === myMemberId).reduce((a, p) => a + p.amount_base, 0);
  const share = e.splits.filter((s) => s.member_id === myMemberId).reduce((a, s) => a + s.amount_base, 0);
  return { involved: paid > 0 || share > 0, net: paid - share };
}

export interface ConvertedTotal {
  /** Everything converted into your default currency (where a rate was available). */
  total: number;
  /** True when any group's balance was converted, so the total is approximate. */
  approx: boolean;
  /** Currencies with no rate at all (API down and nothing cached): shown separately, exact. */
  unconverted: { currency: CurrencyCode; net: number }[];
}

/**
 * Home overall total in your default currency (M5): each other currency is converted with the
 * latest cached rate. `rates` maps "USD:INR" → "96.32" (1 USD = 96.32 INR).
 */
export function convertedTotal(
  totals: OverallTotals,
  defaultCurrency: CurrencyCode,
  rates: Record<string, string | undefined>,
): ConvertedTotal {
  let total = totals.primary;
  let approx = false;
  const unconverted: ConvertedTotal["unconverted"] = [];
  for (const o of totals.others) {
    const scaled = parseRate(rates[`${o.currency}:${defaultCurrency}`] ?? "");
    if (!scaled) {
      unconverted.push(o);
      continue;
    }
    const converted = convertMinor(Math.abs(o.net), scaled);
    total += o.net < 0 ? -converted : converted;
    approx = true;
  }
  return { total, approx, unconverted };
}

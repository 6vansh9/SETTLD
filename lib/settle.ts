import { pairwiseDebts, simplifyDebts, type ExpenseShape, type SettlementShape, type Transfer } from "@/lib/simplify";

/** Disputed (and deleted) settlements don't count toward balances (approved M5 rule). */
export function countsTowardBalances(s: { status: string; deleted_at: string | null }): boolean {
  return s.status !== "disputed" && !s.deleted_at;
}

interface PlanInput {
  simplify: boolean;
  /** Group members in display order (stable tie-break), with their net from group_balances. */
  balances: { memberId: string; net: number }[];
  expenses: ExpenseShape[];
  settlements: (SettlementShape & { status: string; deleted_at: string | null })[];
}

/** Who pays whom: simplified from the balances view, or raw pairwise debts net of settlements. */
export function settlementPlan(p: PlanInput): Transfer[] {
  if (p.simplify) return simplifyDebts(p.balances);
  return pairwiseDebts(p.expenses, p.settlements.filter(countsTowardBalances));
}

/** The plan rows that involve me, the ones I owe first (largest first within each side). */
export function myTransfers(plan: Transfer[], myMemberId: string): Transfer[] {
  const mine = plan.filter((t) => t.from === myMemberId || t.to === myMemberId);
  return mine.sort((a, b) => Number(b.from === myMemberId) - Number(a.from === myMemberId) || b.amount - a.amount);
}

/** What the plan says `from` owes `to` (0 if nothing). */
export function plannedAmount(plan: Transfer[], from: string, to: string): number {
  return plan.find((t) => t.from === from && t.to === to)?.amount ?? 0;
}

/** Confetti rule: this payment clears everything the plan had between the two of them. */
export function clearsDebt(plan: Transfer[], from: string, to: string, amount: number): boolean {
  const owed = plannedAmount(plan, from, to);
  return owed > 0 && amount >= owed;
}

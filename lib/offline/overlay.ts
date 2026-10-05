import type { ExpenseWithLines } from "@/lib/expenses-data";
import { applyDelta, expenseDelta, settlementDelta } from "@/lib/optimistic";
import type { GroupBalance, Settlement } from "@/lib/supabase/types";
import type { QueueItem } from "./types";

export type SyncState = "pending" | "failed";
export type WithSync<T> = T & { sync?: SyncState; syncError?: string };

const forGroup = (items: readonly QueueItem[], groupId: string, userId: string) => items.filter((i) => i.groupId === groupId && i.userId === userId);

/**
 * Show queued writes on top of what the server last sent: new expenses appear (marked), queued
 * edits replace their row, queued deletes hide it. Pure; the list keeps the server's order.
 */
export function overlayExpenses(list: readonly ExpenseWithLines[], items: readonly QueueItem[], groupId: string, userId: string): WithSync<ExpenseWithLines>[] {
  let out: WithSync<ExpenseWithLines>[] = [...list];
  for (const q of forGroup(items, groupId, userId)) {
    const mark = { sync: q.status, syncError: q.error };
    if (q.kind === "create_expense") {
      if (!out.some((e) => e.client_id === q.id && !e.id.startsWith("temp-"))) {
        out = [{ ...q.preview, ...mark }, ...out.filter((e) => e.id !== q.preview.id)];
      }
    } else if (q.kind === "update_expense") {
      out = out.map((e) => (e.id === q.preview.id ? { ...q.preview, ...mark } : e));
    } else if (q.kind === "delete_expense") {
      out = q.status === "pending" ? out.filter((e) => e.id !== q.params.p_expense_id) : out.map((e) => (e.id === q.params.p_expense_id ? { ...e, ...mark } : e));
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1));
}

export function overlaySettlements(list: readonly Settlement[], items: readonly QueueItem[], groupId: string, userId: string): WithSync<Settlement>[] {
  let out: WithSync<Settlement>[] = [...list];
  for (const q of forGroup(items, groupId, userId)) {
    if (q.kind !== "record_settlement") continue;
    if (!out.some((s) => s.client_id === q.id && !s.id.startsWith("temp-"))) {
      out = [{ ...q.preview, sync: q.status, syncError: q.error }, ...out.filter((s) => s.id !== q.preview.id)];
    }
  }
  return out;
}

/** Balances as they'll be once the pending queue syncs (failed items don't count). */
export function overlayBalances(balances: readonly GroupBalance[], items: readonly QueueItem[], groupId: string, userId: string, synced: { expenseClientIds: Set<string>; settlementClientIds: Set<string> }): GroupBalance[] {
  let out = [...balances];
  for (const q of forGroup(items, groupId, userId)) {
    if (q.status !== "pending") continue;
    if (q.kind === "create_expense" && !synced.expenseClientIds.has(q.id)) out = applyDelta(out, expenseDelta(q.preview.payers, q.preview.splits));
    else if (q.kind === "update_expense") out = applyDelta(applyDelta(out, expenseDelta(q.before.payers, q.before.splits), -1), expenseDelta(q.preview.payers, q.preview.splits));
    else if (q.kind === "delete_expense") out = applyDelta(out, expenseDelta(q.before.payers, q.before.splits), -1);
    else if (q.kind === "record_settlement" && !synced.settlementClientIds.has(q.id)) out = applyDelta(out, settlementDelta(q.preview.from_member, q.preview.to_member, q.preview.amount_base));
  }
  return out;
}

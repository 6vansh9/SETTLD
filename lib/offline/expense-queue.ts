"use client";

import type { ExpenseRpcArgs } from "@/lib/expense-form";
import type { ExpenseWithLines } from "@/lib/expenses-data";
import { formatAmount, type CurrencyCode } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";
import { enqueue, findCreate, loadQueue, removeItem, snapshot, updateItem } from "./store";

/** Returned by a mutation that went into the offline queue instead of to the server. */
export const QUEUED = "__queued__" as const;
export type Queued = typeof QUEUED;
export const isQueued = (v: unknown): v is Queued => v === QUEUED;

/** Who's signed in, without the network (the session is stored locally). */
export async function currentUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.user.id ?? null;
}

export function createParams(args: ExpenseRpcArgs, clientId: string, groupId: string) {
  return {
    p_group_id: groupId,
    p_title: args.title,
    p_amount: args.amount,
    p_currency: args.currency,
    p_fx_rate: args.fxRate,
    p_category: args.category,
    p_date: args.date,
    p_note: args.note,
    p_split_type: args.splitType,
    p_payers: args.payers,
    p_splits: args.splits,
    p_client_id: clientId,
  };
}

export function updateParams(expenseId: string, args: ExpenseRpcArgs) {
  const p = createParams(args, "", "");
  return {
    p_expense_id: expenseId,
    p_title: p.p_title,
    p_amount: p.p_amount,
    p_currency: p.p_currency,
    p_fx_rate: p.p_fx_rate,
    p_category: p.p_category,
    p_date: p.p_date,
    p_note: p.p_note,
    p_split_type: p.p_split_type,
    p_payers: p.p_payers,
    p_splits: p.p_splits,
  };
}

/** The row the UI shows for an expense with these arguments (same shape the server returns). */
export function previewExpense(base: Pick<ExpenseWithLines, "id" | "group_id" | "created_by" | "client_id" | "created_at">, args: ExpenseRpcArgs): ExpenseWithLines {
  const payers = args.payers.map((p) => ({ member_id: p.member_id, amount_base: p.amount }));
  const splits = args.splits.map((s) => ({ member_id: s.member_id, amount_base: s.amount, split_type: args.splitType, raw_value: s.raw_value }));
  return {
    ...base,
    title: args.title,
    amount: args.amount,
    currency: args.currency,
    fx_rate_to_base: args.fxRate as unknown as number,
    amount_base: splits.reduce((a, s) => a + s.amount_base, 0),
    category: args.category,
    date: args.date,
    note: args.note,
    deleted_at: null,
    updated_at: new Date().toISOString(),
    payers,
    splits,
  } as ExpenseWithLines;
}

const label = (e: ExpenseWithLines) => `${e.title} · ${formatAmount(e.amount, e.currency as CurrencyCode)}`;

export async function queueCreate(userId: string, groupId: string, clientId: string, args: ExpenseRpcArgs, preview: ExpenseWithLines) {
  await enqueue({ kind: "create_expense", id: clientId, userId, groupId, createdAt: Date.now(), status: "pending", label: label(preview), params: createParams(args, clientId, groupId), preview });
}

/**
 * Editing something still waiting to sync: change the queued create itself (there's nothing on the
 * server yet). Also used to fix a "Couldn't sync" item; it goes back to pending.
 */
export async function patchQueuedCreate(clientId: string, args: ExpenseRpcArgs): Promise<boolean> {
  await loadQueue();
  const q = findCreate(clientId);
  if (!q || q.kind !== "create_expense") return false;
  const preview = previewExpense(q.preview, args);
  await updateItem(clientId, { params: createParams(args, clientId, q.groupId), preview, status: "pending", error: undefined, label: label(preview) });
  return true;
}

/** Deleting something that never reached the server just drops it from the queue. */
export async function discardQueuedCreate(clientId: string): Promise<boolean> {
  await loadQueue();
  if (!findCreate(clientId)) return false;
  await removeItem(clientId);
  return true;
}

export async function queueUpdate(userId: string, before: ExpenseWithLines, args: ExpenseRpcArgs) {
  await loadQueue();
  // One queued edit per expense: keep the original "before", replace the rest.
  const existing = snapshot().find((i) => i.kind === "update_expense" && i.preview.id === before.id && i.status === "pending");
  const original = existing && existing.kind === "update_expense" ? existing.before : before;
  const preview = previewExpense(before, args);
  await enqueue({
    kind: "update_expense",
    id: existing?.id ?? uuid(),
    userId,
    groupId: before.group_id,
    createdAt: existing?.createdAt ?? Date.now(),
    status: "pending",
    label: label(preview),
    params: updateParams(before.id, args),
    preview,
    before: original,
  });
}

export async function queueDelete(userId: string, before: ExpenseWithLines) {
  await enqueue({ kind: "delete_expense", id: uuid(), userId, groupId: before.group_id, createdAt: Date.now(), status: "pending", label: label(before), params: { p_expense_id: before.id }, before });
}

/** Undo of a delete that hasn't synced yet: drop the queued delete. */
export async function cancelQueuedDelete(expenseId: string): Promise<boolean> {
  await loadQueue();
  const q = snapshot().find((i) => i.kind === "delete_expense" && i.params.p_expense_id === expenseId && i.status === "pending");
  if (!q) return false;
  await removeItem(q.id);
  return true;
}

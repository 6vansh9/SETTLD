"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import type { ExpenseRpcArgs } from "@/lib/expense-form";
import { fetchAllBalances, fetchBalances, fetchExpense, fetchExpenses, type ExpenseWithLines } from "@/lib/expenses-data";
import { friendlyError } from "@/lib/groups";
import { applyDelta, compareExpenses, expenseDelta, removeById, replaceTemp, tempId, upsertById } from "@/lib/optimistic";
import { groupKeys } from "@/lib/queries/groups";
import { pendingWrites } from "@/lib/realtime/pending";
import { createClient } from "@/lib/supabase/client";
import type { GroupBalance } from "@/lib/supabase/types";

export const expenseKeys = {
  list: (groupId: string) => ["group", groupId, "expenses"] as const,
  balances: (groupId: string) => ["group", groupId, "balances"] as const,
  allBalances: ["balances"] as const,
};

export function useExpenses(groupId: string, initialData?: ExpenseWithLines[]) {
  return useQuery({ queryKey: expenseKeys.list(groupId), queryFn: () => fetchExpenses(createClient(), groupId), initialData });
}

export function useBalances(groupId: string, initialData?: GroupBalance[]) {
  return useQuery({ queryKey: expenseKeys.balances(groupId), queryFn: () => fetchBalances(createClient(), groupId), initialData });
}

export function useAllBalances(initialData?: GroupBalance[]) {
  return useQuery({ queryKey: expenseKeys.allBalances, queryFn: () => fetchAllBalances(createClient()), initialData });
}

async function rpc<T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw error;
  return data as T;
}

/**
 * Balances are always re-read from the group_balances view after a write (PRD: never rebuilt from
 * events). Fire-and-forget so the UI never waits on it.
 */
export function refreshMoney(qc: QueryClient, groupId: string) {
  void qc.invalidateQueries({ queryKey: expenseKeys.balances(groupId) });
  void qc.invalidateQueries({ queryKey: expenseKeys.allBalances });
  void qc.invalidateQueries({ queryKey: groupKeys.all });
  void qc.invalidateQueries({ queryKey: ["group", groupId, "activity"] });
  void qc.invalidateQueries({ queryKey: ["activity"] });
}

type Snapshot = { list?: ExpenseWithLines[]; balances?: GroupBalance[] };

async function snapshot(qc: QueryClient, groupId: string): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: expenseKeys.list(groupId) });
  await qc.cancelQueries({ queryKey: expenseKeys.balances(groupId) });
  return {
    list: qc.getQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId)),
    balances: qc.getQueryData<GroupBalance[]>(expenseKeys.balances(groupId)),
  };
}

function rollback(qc: QueryClient, groupId: string, s: Snapshot | undefined) {
  if (!s) return;
  qc.setQueryData(expenseKeys.list(groupId), s.list);
  qc.setQueryData(expenseKeys.balances(groupId), s.balances);
}

function linesOf(args: ExpenseRpcArgs) {
  return {
    payers: args.payers.map((p) => ({ member_id: p.member_id, amount_base: p.amount })),
    splits: args.splits.map((s) => ({ member_id: s.member_id, amount_base: s.amount, split_type: args.splitType, raw_value: s.raw_value })),
  };
}

/** Shows "Couldn't save … · Retry" and re-runs the same mutation (same client_id = no duplicates). */
function useFailureToast() {
  const { show } = useToast();
  return (what: string, err: unknown, retry: () => void) =>
    show({ message: `${what}: ${friendlyError(err)}`, duration: 8000, action: { label: "Retry", onClick: retry } });
}

export interface CreateVars {
  args: ExpenseRpcArgs;
  clientId: string;
  /** Overrides the hook's group (the command bar can target any group). */
  groupId?: string;
}

/** Add expense, optimistically: the row and the balance preview appear before the server answers. */
export function useCreateExpense(defaultGroupId: string, myUserId: string) {
  const qc = useQueryClient();
  const fail = useFailureToast();
  const self = useRef<(v: CreateVars) => void>(() => {});
  const m = useMutation({
    mutationFn: async ({ args, clientId, groupId: g }: CreateVars) => {
      const groupId = g ?? defaultGroupId;
      const supabase = createClient();
      const id = await rpc(
        supabase.rpc("create_expense", {
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
        }),
      );
      pendingWrites.start(id);
      return fetchExpense(supabase, id);
    },
    onMutate: async ({ args, clientId, groupId: g }) => {
      const groupId = g ?? defaultGroupId;
      pendingWrites.start(clientId);
      const snap = await snapshot(qc, groupId);
      const { payers, splits } = linesOf(args);
      const now = new Date().toISOString();
      const row: ExpenseWithLines = {
        id: tempId(clientId),
        group_id: groupId,
        title: args.title,
        amount: args.amount,
        currency: args.currency,
        fx_rate_to_base: args.fxRate as unknown as number,
        amount_base: splits.reduce((a, s) => a + s.amount_base, 0),
        category: args.category,
        date: args.date,
        note: args.note,
        created_by: myUserId,
        client_id: clientId,
        deleted_at: null,
        created_at: now,
        updated_at: now,
        payers,
        splits,
      };
      qc.setQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId), (list) => upsertById(list, row, compareExpenses));
      qc.setQueryData<GroupBalance[]>(expenseKeys.balances(groupId), (b) => (b ? applyDelta(b, expenseDelta(payers, splits)) : b));
      return snap;
    },
    onSuccess: (row, { clientId, groupId: g }) => {
      const groupId = g ?? defaultGroupId;
      qc.setQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId), (list) => replaceTemp(list, tempId(clientId), row));
    },
    onError: (err, vars, snap) => {
      rollback(qc, vars.groupId ?? defaultGroupId, snap);
      fail(`Couldn't add “${vars.args.title}”`, err, () => self.current(vars));
    },
    onSettled: (row, _e, { clientId, groupId: g }) => {
      pendingWrites.finish(clientId, row?.id);
      refreshMoney(qc, g ?? defaultGroupId);
    },
  });
  self.current = m.mutate;
  return m;
}

export interface UpdateVars {
  expenseId: string;
  args: ExpenseRpcArgs;
}

export function useUpdateExpense(groupId: string) {
  const qc = useQueryClient();
  const fail = useFailureToast();
  const self = useRef<(v: UpdateVars) => void>(() => {});
  const m = useMutation({
    mutationFn: async ({ expenseId, args }: UpdateVars) => {
      const supabase = createClient();
      await rpc(
        supabase.rpc("update_expense", {
          p_expense_id: expenseId,
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
        }),
      );
      return fetchExpense(supabase, expenseId);
    },
    onMutate: async ({ expenseId, args }) => {
      pendingWrites.start(expenseId);
      const snap = await snapshot(qc, groupId);
      const old = snap.list?.find((e) => e.id === expenseId);
      if (old) {
        const { payers, splits } = linesOf(args);
        const next: ExpenseWithLines = {
          ...old,
          title: args.title,
          amount: args.amount,
          currency: args.currency,
          fx_rate_to_base: args.fxRate as unknown as number,
          amount_base: splits.reduce((a, s) => a + s.amount_base, 0),
          category: args.category,
          date: args.date,
          note: args.note,
          payers,
          splits,
        };
        qc.setQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId), (list) => upsertById(list, next, compareExpenses));
        qc.setQueryData<GroupBalance[]>(expenseKeys.balances(groupId), (b) =>
          b ? applyDelta(applyDelta(b, expenseDelta(old.payers, old.splits), -1), expenseDelta(payers, splits)) : b,
        );
      }
      return snap;
    },
    onSuccess: (row) => {
      if (row) qc.setQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId), (list) => upsertById(list, row, compareExpenses));
    },
    onError: (err, vars, snap) => {
      rollback(qc, groupId, snap);
      fail(`Couldn't save “${vars.args.title}”`, err, () => self.current(vars));
    },
    onSettled: (_r, _e, { expenseId }) => {
      pendingWrites.finish(expenseId);
      refreshMoney(qc, groupId);
    },
  });
  self.current = m.mutate;
  return m;
}

/** Soft delete; the expense leaves the list and the balances at once, and comes back on error. */
export function useDeleteExpense(groupId: string) {
  const qc = useQueryClient();
  const fail = useFailureToast();
  const self = useRef<(e: ExpenseWithLines) => void>(() => {});
  const m = useMutation({
    mutationFn: (e: ExpenseWithLines) => rpc(createClient().rpc("delete_expense", { p_expense_id: e.id })),
    onMutate: async (e) => {
      pendingWrites.start(e.id);
      const snap = await snapshot(qc, groupId);
      qc.setQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId), (list) => removeById(list, e.id));
      qc.setQueryData<GroupBalance[]>(expenseKeys.balances(groupId), (b) => (b ? applyDelta(b, expenseDelta(e.payers, e.splits), -1) : b));
      return snap;
    },
    onError: (err, e, snap) => {
      rollback(qc, groupId, snap);
      fail(`Couldn't delete “${e.title}”`, err, () => self.current(e));
    },
    onSettled: (_r, _e, e) => {
      pendingWrites.finish(e.id);
      refreshMoney(qc, groupId);
    },
  });
  self.current = m.mutate;
  return m;
}

/** Undo a delete: the row comes straight back. */
export function useRestoreExpense(groupId: string) {
  const qc = useQueryClient();
  const fail = useFailureToast();
  const self = useRef<(e: ExpenseWithLines) => void>(() => {});
  const m = useMutation({
    mutationFn: (e: ExpenseWithLines) => rpc(createClient().rpc("restore_expense", { p_expense_id: e.id })),
    onMutate: async (e) => {
      pendingWrites.start(e.id);
      const snap = await snapshot(qc, groupId);
      qc.setQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId), (list) => upsertById(list, { ...e, deleted_at: null }, compareExpenses));
      qc.setQueryData<GroupBalance[]>(expenseKeys.balances(groupId), (b) => (b ? applyDelta(b, expenseDelta(e.payers, e.splits)) : b));
      return snap;
    },
    onError: (err, e, snap) => {
      rollback(qc, groupId, snap);
      fail(`Couldn't restore “${e.title}”`, err, () => self.current(e));
    },
    onSettled: (_r, _e, e) => {
      pendingWrites.finish(e.id);
      void qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) });
      refreshMoney(qc, groupId);
    },
  });
  self.current = m.mutate;
  return m;
}

export function useSetSimplify(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (simplify: boolean) => rpc(createClient().rpc("set_group_simplify", { p_group_id: groupId, p_simplify: simplify })),
    onSettled: () =>
      Promise.all([qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) }), qc.invalidateQueries({ queryKey: groupKeys.all })]),
  });
}

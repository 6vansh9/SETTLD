"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllBalances, fetchBalances, fetchExpenses, type ExpenseWithLines } from "@/lib/expenses-data";
import type { ExpenseRpcArgs } from "@/lib/expense-form";
import { groupKeys } from "@/lib/queries/groups";
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

/** After any money write, refetch the list and the balances view rather than patching numbers locally. */
function useInvalidateMoney(groupId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) }),
      qc.invalidateQueries({ queryKey: expenseKeys.balances(groupId) }),
      qc.invalidateQueries({ queryKey: expenseKeys.allBalances }),
      qc.invalidateQueries({ queryKey: groupKeys.all }),
    ]);
}

export function useCreateExpense(groupId: string) {
  const invalidate = useInvalidateMoney(groupId);
  return useMutation({
    mutationFn: ({ args, clientId }: { args: ExpenseRpcArgs; clientId: string }) =>
      rpc(
        createClient().rpc("create_expense", {
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
      ),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateExpense(groupId: string) {
  const invalidate = useInvalidateMoney(groupId);
  return useMutation({
    mutationFn: ({ expenseId, args }: { expenseId: string; args: ExpenseRpcArgs }) =>
      rpc(
        createClient().rpc("update_expense", {
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
      ),
    onSuccess: () => invalidate(),
  });
}

/** Soft delete; the expense disappears from the list immediately and comes back on error. */
export function useDeleteExpense(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMoney(groupId);
  return useMutation({
    mutationFn: (expenseId: string) => rpc(createClient().rpc("delete_expense", { p_expense_id: expenseId })),
    onMutate: async (expenseId) => {
      await qc.cancelQueries({ queryKey: expenseKeys.list(groupId) });
      const previous = qc.getQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId));
      qc.setQueryData<ExpenseWithLines[]>(expenseKeys.list(groupId), (list) => list?.filter((e) => e.id !== expenseId));
      return { previous };
    },
    onError: (_e, _id, ctx) => qc.setQueryData(expenseKeys.list(groupId), ctx?.previous),
    onSettled: () => invalidate(),
  });
}

export function useRestoreExpense(groupId: string) {
  const invalidate = useInvalidateMoney(groupId);
  return useMutation({
    mutationFn: (expenseId: string) => rpc(createClient().rpc("restore_expense", { p_expense_id: expenseId })),
    onSettled: () => invalidate(),
  });
}

export function useSetSimplify(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (simplify: boolean) => rpc(createClient().rpc("set_group_simplify", { p_group_id: groupId, p_simplify: simplify })),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
        qc.invalidateQueries({ queryKey: groupKeys.all }),
      ]),
  });
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { expenseKeys } from "@/lib/queries/expenses";
import { groupKeys } from "@/lib/queries/groups";
import { fetchSettlements } from "@/lib/settlements-data";
import { createClient } from "@/lib/supabase/client";
import type { Settlement, SettlementMethod } from "@/lib/supabase/types";

export const settlementKeys = {
  list: (groupId: string) => ["group", groupId, "settlements"] as const,
};

export function useSettlements(groupId: string, initialData?: Settlement[]) {
  return useQuery({ queryKey: settlementKeys.list(groupId), queryFn: () => fetchSettlements(createClient(), groupId), initialData });
}

async function rpc<T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw error;
  return data as T;
}

/**
 * Settlements move balances: refetch them, the balances view and Home. Fire-and-forget on purpose:
 * returning the promise would make mutateAsync wait for every refetch, delaying the success screen.
 */
function useInvalidate(groupId: string) {
  const qc = useQueryClient();
  return () =>
    void Promise.all([
      qc.invalidateQueries({ queryKey: settlementKeys.list(groupId) }),
      qc.invalidateQueries({ queryKey: expenseKeys.balances(groupId) }),
      qc.invalidateQueries({ queryKey: expenseKeys.allBalances }),
      qc.invalidateQueries({ queryKey: groupKeys.all }),
    ]);
}

export interface NewSettlement {
  from: string;
  to: string;
  amount: number;
  method: SettlementMethod;
  clientId: string;
}

export function useRecordSettlement(groupId: string) {
  const invalidate = useInvalidate(groupId);
  return useMutation({
    mutationFn: (s: NewSettlement) =>
      rpc(
        createClient().rpc("record_settlement", {
          p_group_id: groupId,
          p_from_member: s.from,
          p_to_member: s.to,
          p_amount: s.amount,
          p_method: s.method,
          p_client_id: s.clientId,
        }),
      ),
    onSettled: () => invalidate(),
  });
}

function useSimple(groupId: string, fn: "confirm_settlement" | "dispute_settlement" | "restore_settlement") {
  const invalidate = useInvalidate(groupId);
  return useMutation({
    mutationFn: (id: string) => rpc(createClient().rpc(fn, { p_settlement_id: id })),
    onSettled: () => invalidate(),
  });
}

export const useConfirmSettlement = (groupId: string) => useSimple(groupId, "confirm_settlement");
export const useDisputeSettlement = (groupId: string) => useSimple(groupId, "dispute_settlement");
export const useRestoreSettlement = (groupId: string) => useSimple(groupId, "restore_settlement");

export function useUpdateSettlement(groupId: string) {
  const invalidate = useInvalidate(groupId);
  return useMutation({
    mutationFn: (v: { id: string; amount: number; method: SettlementMethod }) =>
      rpc(createClient().rpc("update_settlement", { p_settlement_id: v.id, p_amount: v.amount, p_method: v.method })),
    onSettled: () => invalidate(),
  });
}

/** Soft delete; disappears from the list immediately, comes back on error. */
export function useDeleteSettlement(groupId: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidate(groupId);
  return useMutation({
    mutationFn: (id: string) => rpc(createClient().rpc("delete_settlement", { p_settlement_id: id })),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: settlementKeys.list(groupId) });
      const previous = qc.getQueryData<Settlement[]>(settlementKeys.list(groupId));
      qc.setQueryData<Settlement[]>(settlementKeys.list(groupId), (list) => list?.filter((s) => s.id !== id));
      return { previous };
    },
    onError: (_e, _id, ctx) => qc.setQueryData(settlementKeys.list(groupId), ctx?.previous),
    onSettled: () => invalidate(),
  });
}

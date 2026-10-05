"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { friendlyError } from "@/lib/groups";
import { formatAmount, type CurrencyCode } from "@/lib/money";
import { applyDelta, compareNewestFirst, removeById, replaceTemp, settlementDelta, tempId, upsertById } from "@/lib/optimistic";
import { expenseKeys, refreshMoney } from "@/lib/queries/expenses";
import { pendingWrites } from "@/lib/realtime/pending";
import { isQueued, QUEUED, type Queued } from "@/lib/offline/expense-queue";
import { isNetworkError, isOffline } from "@/lib/offline/net";
import { enqueue } from "@/lib/offline/store";
import { countsTowardBalances } from "@/lib/settle";
import { fetchSettlement, fetchSettlements } from "@/lib/settlements-data";
import { createClient } from "@/lib/supabase/client";
import type { GroupBalance, Settlement, SettlementMethod } from "@/lib/supabase/types";

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

type Snapshot = { list?: Settlement[]; balances?: GroupBalance[] };

async function snapshot(qc: QueryClient, groupId: string): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: settlementKeys.list(groupId) });
  await qc.cancelQueries({ queryKey: expenseKeys.balances(groupId) });
  return {
    list: qc.getQueryData<Settlement[]>(settlementKeys.list(groupId)),
    balances: qc.getQueryData<GroupBalance[]>(expenseKeys.balances(groupId)),
  };
}

function rollback(qc: QueryClient, groupId: string, s: Snapshot | undefined) {
  if (!s) return;
  qc.setQueryData(settlementKeys.list(groupId), s.list);
  qc.setQueryData(expenseKeys.balances(groupId), s.balances);
}

/** Replace a settlement in the cache and move the balance preview by the change in what counts. */
function applyChange(qc: QueryClient, groupId: string, before: Settlement | null, after: Settlement | null) {
  qc.setQueryData<Settlement[]>(settlementKeys.list(groupId), (list) =>
    after ? upsertById(list, after, compareNewestFirst) : before ? removeById(list, before.id) : list,
  );
  qc.setQueryData<GroupBalance[]>(expenseKeys.balances(groupId), (b) => {
    if (!b) return b;
    let next = b;
    if (before && countsTowardBalances(before)) next = applyDelta(next, settlementDelta(before.from_member, before.to_member, before.amount_base), -1);
    if (after && countsTowardBalances(after)) next = applyDelta(next, settlementDelta(after.from_member, after.to_member, after.amount_base));
    return next;
  });
}

function useFailureToast() {
  const { show } = useToast();
  return (what: string, err: unknown, retry: () => void) =>
    show({ message: `${what}: ${friendlyError(err)}`, duration: 8000, action: { label: "Retry", onClick: retry } });
}

export interface NewSettlement {
  from: string;
  to: string;
  amount: number;
  method: SettlementMethod;
  clientId: string;
  /** The Settle sheet shows its own inline error instead of a toast. */
  silent?: boolean;
}

/** Record a payment, optimistically (pending; or confirmed when I'm the receiver). */
export function useRecordSettlement(groupId: string, ctx: { myUserId: string; myMemberId: string; currency: CurrencyCode }) {
  const qc = useQueryClient();
  const fail = useFailureToast();
  const self = useRef<(v: NewSettlement) => void>(() => {});
  const m = useMutation({
    mutationFn: async (s: NewSettlement): Promise<Settlement | null | Queued> => {
      const supabase = createClient();
      const params = {
        p_group_id: groupId,
        p_from_member: s.from,
        p_to_member: s.to,
        p_amount: s.amount,
        p_method: s.method,
        p_client_id: s.clientId,
      };
      // Offline: queue it with the same client_id (no duplicate payment on retry).
      const toQueue = async () => {
        const now = new Date().toISOString();
        const preview: Settlement = {
          id: tempId(s.clientId),
          group_id: groupId,
          from_member: s.from,
          to_member: s.to,
          amount: s.amount,
          currency: ctx.currency,
          amount_base: s.amount,
          method: s.method,
          status: s.to === ctx.myMemberId ? "confirmed" : "pending",
          client_id: s.clientId,
          created_by: ctx.myUserId,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };
        await enqueue({
          kind: "record_settlement",
          id: s.clientId,
          userId: ctx.myUserId,
          groupId,
          createdAt: Date.now(),
          status: "pending",
          label: `Payment · ${formatAmount(s.amount, ctx.currency)}`,
          params,
          preview,
        });
        return QUEUED;
      };
      if (isOffline()) return toQueue();
      let id: string;
      try {
        id = await rpc(supabase.rpc("record_settlement", params));
      } catch (err) {
        if (isNetworkError(err)) return toQueue();
        throw err;
      }
      pendingWrites.start(id);
      return fetchSettlement(supabase, id);
    },
    onMutate: async (s) => {
      pendingWrites.start(s.clientId);
      const snap = await snapshot(qc, groupId);
      const now = new Date().toISOString();
      applyChange(qc, groupId, null, {
        id: tempId(s.clientId),
        group_id: groupId,
        from_member: s.from,
        to_member: s.to,
        amount: s.amount,
        currency: ctx.currency,
        amount_base: s.amount,
        method: s.method,
        status: s.to === ctx.myMemberId ? "confirmed" : "pending",
        client_id: s.clientId,
        created_by: ctx.myUserId,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
      return snap;
    },
    onSuccess: (row, s, snap) => {
      // Queued: the overlay shows it ("Waiting to sync") until it reaches the server.
      if (isQueued(row)) return rollback(qc, groupId, snap);
      qc.setQueryData<Settlement[]>(settlementKeys.list(groupId), (list) => replaceTemp(list, tempId(s.clientId), row));
    },
    onError: (err, s, snap) => {
      rollback(qc, groupId, snap);
      if (!s.silent) fail("Couldn't record the payment", err, () => self.current(s));
    },
    onSettled: (row, _e, s) => {
      pendingWrites.finish(s.clientId, row && !isQueued(row) ? row.id : null);
      if (!isQueued(row)) refreshMoney(qc, groupId);
    },
  });
  self.current = m.mutate;
  return m;
}

/** Confirm / dispute / edit / delete / restore: all optimistic on an existing row. */
function useChange<V extends { settlement: Settlement }>(
  groupId: string,
  run: (v: V) => PromiseLike<{ data: unknown; error: unknown }>,
  next: (v: V) => Settlement | null,
  label: string,
) {
  const qc = useQueryClient();
  const fail = useFailureToast();
  const self = useRef<(v: V) => void>(() => {});
  const m = useMutation({
    mutationFn: (v: V) => rpc(run(v)),
    onMutate: async (v) => {
      pendingWrites.start(v.settlement.id);
      const snap = await snapshot(qc, groupId);
      applyChange(qc, groupId, v.settlement, next(v));
      return snap;
    },
    onError: (err, v, snap) => {
      rollback(qc, groupId, snap);
      fail(label, err, () => self.current(v));
    },
    onSettled: (_r, _e, v) => {
      pendingWrites.finish(v.settlement.id);
      void qc.invalidateQueries({ queryKey: settlementKeys.list(groupId) });
      refreshMoney(qc, groupId);
    },
  });
  self.current = m.mutate;
  return m;
}

export const useConfirmSettlement = (groupId: string) =>
  useChange<{ settlement: Settlement }>(
    groupId,
    (v) => createClient().rpc("confirm_settlement", { p_settlement_id: v.settlement.id }),
    (v) => ({ ...v.settlement, status: "confirmed" }),
    "Couldn't confirm the payment",
  );

export const useDisputeSettlement = (groupId: string) =>
  useChange<{ settlement: Settlement }>(
    groupId,
    (v) => createClient().rpc("dispute_settlement", { p_settlement_id: v.settlement.id }),
    (v) => ({ ...v.settlement, status: "disputed" }),
    "Couldn't dispute the payment",
  );

export const useUpdateSettlement = (groupId: string, myMemberId: string) =>
  useChange<{ settlement: Settlement; amount: number; method: SettlementMethod }>(
    groupId,
    (v) => createClient().rpc("update_settlement", { p_settlement_id: v.settlement.id, p_amount: v.amount, p_method: v.method }),
    (v) => ({
      ...v.settlement,
      amount: v.amount,
      amount_base: v.amount,
      method: v.method,
      status: v.settlement.to_member === myMemberId ? "confirmed" : "pending",
    }),
    "Couldn't change the payment",
  );

export const useDeleteSettlement = (groupId: string) =>
  useChange<{ settlement: Settlement }>(
    groupId,
    (v) => createClient().rpc("delete_settlement", { p_settlement_id: v.settlement.id }),
    () => null,
    "Couldn't delete the payment",
  );

export const useRestoreSettlement = (groupId: string) =>
  useChange<{ settlement: Settlement }>(
    groupId,
    (v) => createClient().rpc("restore_settlement", { p_settlement_id: v.settlement.id }),
    (v) => ({ ...v.settlement, deleted_at: null }),
    "Couldn't restore the payment",
  );

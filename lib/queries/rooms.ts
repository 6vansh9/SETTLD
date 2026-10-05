"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/providers/ToastProvider";
import { friendlyError } from "@/lib/groups";
import { expenseKeys, refreshMoney } from "@/lib/queries/expenses";
import { fetchOpenRooms, fetchRoomByCode, sharesOf, withClaim, type RoomData } from "@/lib/split-room-data";
import type { RoomCharges } from "@/lib/splitRoom";
import { createClient } from "@/lib/supabase/client";
import type { Json, SplitRoomItem } from "@/lib/supabase/types";

export const roomKeys = {
  room: (code: string) => ["room", code] as const,
  open: (groupId: string) => ["group", groupId, "rooms"] as const,
};

export function useRoom(code: string, initialData?: RoomData | null) {
  return useQuery({ queryKey: roomKeys.room(code), queryFn: () => fetchRoomByCode(createClient(), code), initialData });
}

export function useOpenRooms(groupId: string) {
  return useQuery({ queryKey: roomKeys.open(groupId), queryFn: () => fetchOpenRooms(createClient(), groupId) });
}

async function rpc<T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw error;
  return data as T;
}

/**
 * Room writes reach the server one at a time, in tap order, so the server ends where the screen
 * did. (Not TanStack's mutation scope: that also holds back each queued tap's optimistic update.)
 */
const queues = new Map<string, Promise<unknown>>();
function inOrder<T>(code: string, run: () => Promise<T>): Promise<T> {
  const next = (queues.get(code) ?? Promise.resolve()).catch(() => undefined).then(run);
  queues.set(code, next);
  return next;
}

/** Is any write to this room in flight? Realtime refetches wait for them (the mutation owns the cache). */
export const roomBusy = (qc: QueryClient, code: string) => qc.isMutating({ mutationKey: roomKeys.room(code) }) > 0;

/** After the last in-flight write settles, read the room once from the server. */
function settleRoom(qc: QueryClient, code: string) {
  setTimeout(() => {
    if (!roomBusy(qc, code)) void qc.invalidateQueries({ queryKey: roomKeys.room(code) });
  }, 0);
}

/** Synchronous, so the next tap (even 30 ms later) builds on this one. */
function optimistic(qc: QueryClient, code: string, change: (d: RoomData) => RoomData) {
  void qc.cancelQueries({ queryKey: roomKeys.room(code) });
  qc.setQueryData<RoomData | null>(roomKeys.room(code), (d) => (d ? change(d) : d));
}

/** The room as the screen has it right now (optimistic changes included). */
export function latestRoom(qc: QueryClient, code: string): RoomData | null | undefined {
  return qc.getQueryData<RoomData | null>(roomKeys.room(code));
}

export type ClaimVars =
  /** Me tapping an item. */
  | { kind: "toggle"; itemId: string; memberId: string; on: boolean }
  /** Host putting someone (a ghost) on or off an item. */
  | { kind: "assign"; itemId: string; memberId: string; on: boolean }
  /** Long-press: custom shares (mine, or anyone's for the host). */
  | { kind: "shares"; itemId: string; memberId: string; shares: number; self: boolean };

export function useClaim(code: string) {
  const qc = useQueryClient();
  const { show } = useToast();
  return useMutation({
    mutationKey: roomKeys.room(code),
    mutationFn: (v: ClaimVars) =>
      inOrder(code, () => {
        const supabase = createClient();
        if (v.kind === "toggle") return rpc(supabase.rpc("toggle_claim", { p_item_id: v.itemId, p_on: v.on }));
        if (v.kind === "assign") return rpc(supabase.rpc("assign_claim", { p_item_id: v.itemId, p_member_id: v.memberId, p_on: v.on }));
        return rpc(supabase.rpc("set_claim_shares", { p_item_id: v.itemId, p_shares: v.shares, p_member_id: v.self ? null : v.memberId }));
      }),
    onMutate: (v) => {
      optimistic(qc, code, (d) =>
        withClaim(d, v.itemId, v.memberId, v.kind === "shares" ? v.shares : v.on ? Math.max(1, sharesOf(d, v.itemId, v.memberId)) : 0),
      );
    },
    onError: (err) => show({ message: `Couldn't save that tap: ${friendlyError(err)}`, duration: 6000 }),
    onSettled: () => settleRoom(qc, code),
  });
}

export interface ItemsVars {
  roomId: string;
  /** Omit to leave the items alone (saving only charges or the name). */
  items?: Pick<SplitRoomItem, "id" | "name" | "price" | "qty">[];
  charges?: RoomCharges;
  name?: string;
}

/** Host: save the item list (and optionally charges / name). Optimistic. */
export function useSaveItems(code: string) {
  const qc = useQueryClient();
  const { show } = useToast();
  return useMutation({
    mutationKey: roomKeys.room(code),
    mutationFn: (v: ItemsVars) =>
      inOrder(code, () =>
        rpc(
          createClient().rpc("upsert_items", {
            p_room_id: v.roomId,
            p_items: (v.items ?? null) as unknown as Json,
            p_charges: (v.charges ?? null) as unknown as Json,
            p_name: v.name ?? null,
          }),
        ),
      ),
    onMutate: (v) => {
      const now = new Date().toISOString();
      optimistic(qc, code, (d) => {
        const old = new Map(d.items.map((i) => [i.id, i]));
        const room = { ...d.room };
        if (v.charges) {
          room.tax_kind = v.charges.tax.kind;
          room.tax_value = v.charges.tax.value;
          room.service_kind = v.charges.service.kind;
          room.service_value = v.charges.service.value;
          room.tip_kind = v.charges.tip.kind;
          room.tip_value = v.charges.tip.value;
        }
        if (v.name) room.name = v.name;
        return {
          ...d,
          room,
          items: !v.items
            ? d.items
            : (v.items.map((i, k) => ({
            ...(old.get(i.id) ?? { room_id: d.room.id, deleted_at: null, created_at: now }),
            ...i,
            position: k + 1,
            updated_at: now,
          })) as SplitRoomItem[]),
        };
      });
    },
    onError: (err) => show({ message: `Couldn't save the items: ${friendlyError(err)}`, duration: 6000 }),
    onSettled: () => settleRoom(qc, code),
  });
}

export function useCreateRoom() {
  return useMutation({
    mutationFn: (v: { groupId: string; name: string }) => rpc(createClient().rpc("create_room", { p_group_id: v.groupId, p_name: v.name })),
  });
}

export function useJoinRoom() {
  return useMutation({ mutationFn: (code: string) => rpc(createClient().rpc("join_room", { p_code: code })) });
}

export function useFinalizeRoom(code: string, groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: roomKeys.room(code),
    mutationFn: (v: { roomId: string; payer: string; clientId: string }) =>
      inOrder(code, () => rpc(createClient().rpc("finalize_room", { p_room_id: v.roomId, p_payer: v.payer, p_client_id: v.clientId }))),
    onSettled: () => {
      settleRoom(qc, code);
      void qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) });
      void qc.invalidateQueries({ queryKey: roomKeys.open(groupId) });
      refreshMoney(qc, groupId);
    },
  });
}

export function useCancelRoom(code: string, groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: roomKeys.room(code),
    mutationFn: (roomId: string) => inOrder(code, () => rpc(createClient().rpc("cancel_room", { p_room_id: roomId }))),
    onSettled: () => {
      settleRoom(qc, code);
      void qc.invalidateQueries({ queryKey: roomKeys.open(groupId) });
    },
  });
}

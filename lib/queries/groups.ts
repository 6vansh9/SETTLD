"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchGroup, fetchGroups, fetchInviteToken, type GroupWithMembers } from "@/lib/groups-data";
import type { CurrencyCode } from "@/lib/money";
import type { Pastel } from "@/lib/pastels";
import { createClient } from "@/lib/supabase/client";
import type { GroupType } from "@/lib/supabase/types";

export const groupKeys = {
  all: ["groups"] as const,
  detail: (id: string) => ["group", id] as const,
  invite: (id: string) => ["group", id, "invite"] as const,
};

export function useGroups(initialData?: GroupWithMembers[], enabled = true) {
  return useQuery({ queryKey: groupKeys.all, queryFn: () => fetchGroups(createClient()), initialData, enabled });
}

export function useGroup(id: string, initialData?: GroupWithMembers | null) {
  return useQuery({ queryKey: groupKeys.detail(id), queryFn: () => fetchGroup(createClient(), id), initialData });
}

export function useInviteToken(groupId: string, enabled = true) {
  return useQuery({
    queryKey: groupKeys.invite(groupId),
    queryFn: () => fetchInviteToken(createClient(), groupId),
    enabled,
  });
}

/** Run an RPC and throw its error so TanStack Query sees it. */
async function rpc<T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw error;
  return data as T;
}

function useInvalidateGroup() {
  const queryClient = useQueryClient();
  return (groupId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupKeys.all }),
      groupId ? queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) }) : null,
    ]);
}

export interface NewGroup {
  name: string;
  emoji: string;
  color: Pastel;
  baseCurrency: CurrencyCode;
  type: GroupType;
}

export function useCreateGroup() {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (g: NewGroup) =>
      rpc(
        createClient().rpc("create_group", {
          p_name: g.name.trim(),
          p_emoji: g.emoji,
          p_color: g.color,
          p_base_currency: g.baseCurrency,
          p_type: g.type,
        }),
      ),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateGroup(groupId: string) {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (g: { name: string; emoji: string; color: Pastel }) =>
      rpc(createClient().rpc("update_group", { p_group_id: groupId, p_name: g.name.trim(), p_emoji: g.emoji, p_color: g.color })),
    onSuccess: () => invalidate(groupId),
  });
}

export function useSetArchived(groupId: string) {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (archived: boolean) =>
      rpc(createClient().rpc("set_group_archived", { p_group_id: groupId, p_archived: archived })),
    onSuccess: () => invalidate(groupId),
  });
}

export function useAddGhost(groupId: string) {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (name: string) => rpc(createClient().rpc("add_ghost", { p_group_id: groupId, p_name: name.trim() })),
    onSuccess: () => invalidate(groupId),
  });
}

export function useRemoveMember(groupId: string) {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (memberId: string) => rpc(createClient().rpc("remove_member", { p_member_id: memberId })),
    onSuccess: () => invalidate(groupId),
  });
}

export function useRegenerateInvite(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rpc(createClient().rpc("regenerate_invite", { p_group_id: groupId })),
    onSuccess: (token) => queryClient.setQueryData(groupKeys.invite(groupId), token),
  });
}

export function useGhostClaimLink() {
  return useMutation({
    mutationFn: (memberId: string) => rpc(createClient().rpc("ghost_claim_link", { p_member_id: memberId })),
  });
}

export function useJoinGroup() {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (token: string) => rpc(createClient().rpc("join_group", { p_token: token })),
    onSuccess: (groupId) => invalidate(groupId),
  });
}

export function useClaimGhost() {
  const invalidate = useInvalidateGroup();
  return useMutation({
    mutationFn: (v: { token: string; memberId: string }) =>
      rpc(createClient().rpc("claim_ghost", { p_token: v.token, p_member_id: v.memberId })),
    onSuccess: (groupId) => invalidate(groupId),
  });
}

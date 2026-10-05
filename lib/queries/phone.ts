"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export const phoneKeys = {
  mine: ["phone", "mine"] as const,
  ghosts: (groupId: string) => ["group", groupId, "ghost-phones"] as const,
};

async function rpc<T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw error;
  return data as T;
}

/** My own phone (RLS: only I can read it). null = none saved. */
export async function fetchMyPhone(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("user_phones").select("phone").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data?.phone ?? null;
}

export function useMyPhone(initialData?: string | null) {
  return useQuery({ queryKey: phoneKeys.mine, queryFn: fetchMyPhone, initialData });
}

export function useSetMyPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e164: string | null) => rpc(createClient().rpc("set_my_phone", { p_phone: e164 })),
    onSuccess: (_d, e164) => qc.setQueryData(phoneKeys.mine, e164),
  });
}

/** Ghost phones in a group: admins only (RLS returns nothing to anyone else). member id → E.164. */
export function useGhostPhones(groupId: string, enabled: boolean) {
  return useQuery({
    queryKey: phoneKeys.ghosts(groupId),
    enabled,
    queryFn: async () => {
      const { data, error } = await createClient().from("ghost_phones").select("member_id, phone").eq("group_id", groupId);
      if (error) throw error;
      return new Map(data.map((r) => [r.member_id, r.phone]));
    },
  });
}

export function useSetGhostPhone(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { memberId: string; phone: string | null }) => rpc(createClient().rpc("set_ghost_phone", { p_member_id: v.memberId, p_phone: v.phone })),
    onSettled: () => void qc.invalidateQueries({ queryKey: phoneKeys.ghosts(groupId) }),
  });
}

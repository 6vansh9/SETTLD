"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/providers/ToastProvider";
import { friendlyError } from "@/lib/groups";
import { groupKeys } from "@/lib/queries/groups";
import { EMPTY_SOCIAL, withReaction, withSeen, type SocialData } from "@/lib/social";
import { createClient } from "@/lib/supabase/client";
import type { Comment, Nudge, NudgeMode, NotifyLevel, ReactionEmoji, SocialEntity } from "@/lib/supabase/types";
import { uuid } from "@/lib/uuid";

type Client = ReturnType<typeof createClient>;

export const socialKeys = {
  group: (groupId: string) => ["group", groupId, "social"] as const,
  nudges: (groupId: string) => ["group", groupId, "nudges"] as const,
};

export async function fetchSocial(supabase: Client, groupId: string): Promise<SocialData> {
  const [reactions, comments, seen] = await Promise.all([
    supabase.from("reactions").select("*").eq("group_id", groupId),
    supabase.from("comments").select("*").eq("group_id", groupId).is("deleted_at", null).order("created_at"),
    supabase.from("entity_seen").select("*").eq("group_id", groupId),
  ]);
  if (reactions.error) throw reactions.error;
  if (comments.error) throw comments.error;
  if (seen.error) throw seen.error;
  return { reactions: reactions.data, comments: comments.data, seen: seen.data };
}

export function useSocial(groupId: string) {
  return useQuery({ queryKey: socialKeys.group(groupId), queryFn: () => fetchSocial(createClient(), groupId), placeholderData: EMPTY_SOCIAL });
}

async function rpc<T>(call: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await call;
  if (error) throw error;
  return data as T;
}

function edit(qc: QueryClient, groupId: string, change: (d: SocialData) => SocialData) {
  void qc.cancelQueries({ queryKey: socialKeys.group(groupId) });
  const before = qc.getQueryData<SocialData>(socialKeys.group(groupId));
  qc.setQueryData<SocialData>(socialKeys.group(groupId), (d) => change(d ?? EMPTY_SOCIAL));
  return before;
}

export interface EntityRef {
  type: SocialEntity;
  id: string;
}

export function useToggleReaction(groupId: string, myMemberId: string) {
  const qc = useQueryClient();
  const { show } = useToast();
  return useMutation({
    mutationFn: (v: EntityRef & { emoji: ReactionEmoji }) =>
      rpc(createClient().rpc("toggle_reaction", { p_entity_type: v.type, p_entity_id: v.id, p_emoji: v.emoji })),
    onMutate: (v) => edit(qc, groupId, (d) => withReaction(d, { groupId, type: v.type, id: v.id, memberId: myMemberId, emoji: v.emoji })),
    onError: (err, _v, before) => {
      qc.setQueryData(socialKeys.group(groupId), before);
      show({ message: `Couldn't react: ${friendlyError(err)}` });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: socialKeys.group(groupId) }),
  });
}

export function useAddComment(groupId: string, myMemberId: string) {
  const qc = useQueryClient();
  const { show } = useToast();
  const m = useMutation({
    mutationFn: (v: EntityRef & { body: string; clientId: string }) =>
      rpc(createClient().rpc("add_comment", { p_entity_type: v.type, p_entity_id: v.id, p_body: v.body, p_client_id: v.clientId })),
    onMutate: (v) => {
      const temp: Comment = {
        id: `temp-${v.clientId}`,
        group_id: groupId,
        entity_type: v.type,
        entity_id: v.id,
        member_id: myMemberId,
        body: v.body.trim(),
        client_id: v.clientId,
        created_at: new Date().toISOString(),
        deleted_at: null,
      };
      return edit(qc, groupId, (d) => ({ ...d, comments: [...d.comments, temp] }));
    },
    onSuccess: (id, v) =>
      qc.setQueryData<SocialData>(socialKeys.group(groupId), (d) =>
        d ? { ...d, comments: d.comments.map((c) => (c.id === `temp-${v.clientId}` ? { ...c, id } : c)) } : d,
      ),
    onError: (err, v, before) => {
      qc.setQueryData(socialKeys.group(groupId), before);
      show({ message: `Couldn't post that: ${friendlyError(err)}`, duration: 8000, action: { label: "Retry", onClick: () => m.mutate(v) } });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: socialKeys.group(groupId) }),
  });
  return m;
}

export function useDeleteComment(groupId: string) {
  const qc = useQueryClient();
  const { show } = useToast();
  return useMutation({
    mutationFn: (commentId: string) => rpc(createClient().rpc("delete_comment", { p_comment_id: commentId })),
    onMutate: (id) => edit(qc, groupId, (d) => ({ ...d, comments: d.comments.filter((c) => c.id !== id) })),
    onError: (err, _id, before) => {
      qc.setQueryData(socialKeys.group(groupId), before);
      show({ message: `Couldn't delete: ${friendlyError(err)}` });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: socialKeys.group(groupId) }),
  });
}

/** Opening an item clears its dot at once; the server mark follows quietly. */
export function useMarkSeen(groupId: string, myMemberId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: EntityRef) => rpc(createClient().rpc("mark_seen", { p_entity_type: v.type, p_entity_id: v.id })),
    onMutate: (v) => {
      edit(qc, groupId, (d) => withSeen(d, { groupId, type: v.type, id: v.id, memberId: myMemberId }));
    },
  });
}

// ------------------------------------------------------------------------------------------------
// Nudges and settings
// ------------------------------------------------------------------------------------------------

export function useNudges(groupId: string) {
  return useQuery({
    queryKey: socialKeys.nudges(groupId),
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("nudges")
        .select("*")
        .eq("group_id", groupId)
        .gt("sent_at", new Date(Date.now() - 15 * 86400_000).toISOString())
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data.map((n) => ({ ...n, amount: Number(n.amount) })) as Nudge[];
    },
  });
}

/** Ask the server to send this nudge's push now. true = it went out; null = couldn't tell (never throws). */
async function pushNudge(nudgeId: string): Promise<boolean | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch("/api/push/nudge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nudgeId }),
      signal: ctrl.signal,
    });
    const body = (await res.json().catch(() => null)) as { delivered?: boolean } | null;
    return res.ok ? !!body?.delivered : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** The nudge limits from the database (public.nudge_rules), for the button's countdown. */
export function useNudgeRules() {
  return useQuery({
    queryKey: ["nudge-rules"],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("nudge_rules");
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

export function useSendNudge(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { toMember: string; amount: number; template: number }) => {
      const row = await rpc(createClient().rpc("send_nudge", { p_to_member: v.toMember, p_amount: v.amount, p_template: v.template }));
      // Push it from here too, so it never depends on the database webhook alone (0015 dedupes).
      const delivered = await pushNudge(row.id);
      return { ...row, delivered };
    },
    onSuccess: (row) => qc.setQueryData<Nudge[]>(socialKeys.nudges(groupId), (list) => [{ ...row, amount: Number(row.amount) }, ...(list ?? [])]),
    onSettled: () => void qc.invalidateQueries({ queryKey: socialKeys.nudges(groupId) }),
  });
}

export function useSetNotifyLevel(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (level: NotifyLevel) => rpc(createClient().rpc("set_notify_level", { p_group_id: groupId, p_level: level })),
    onSettled: () => void qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) }),
  });
}

export function useSetNudgeMode(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: NudgeMode) => rpc(createClient().rpc("set_nudge_mode", { p_group_id: groupId, p_mode: mode })),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) }), qc.invalidateQueries({ queryKey: groupKeys.all })]),
  });
}

export { uuid as newClientId };

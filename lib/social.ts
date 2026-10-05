import type { Comment, EntitySeen, Reaction, ReactionEmoji, SocialEntity } from "@/lib/supabase/types";
import { REACTION_EMOJIS } from "@/lib/supabase/types";

export interface SocialData {
  reactions: Reaction[];
  comments: Comment[];
  seen: EntitySeen[];
}

export const EMPTY_SOCIAL: SocialData = { reactions: [], comments: [], seen: [] };
export const COMMENT_MAX = 280;

const key = (type: SocialEntity, id: string) => `${type}:${id}`;

/** Live reactions on an item, grouped by emoji in the fixed order, with who reacted. */
export function reactionSummary(d: SocialData, type: SocialEntity, id: string, myMemberId: string) {
  const live = d.reactions.filter((r) => r.entity_type === type && r.entity_id === id && r.emoji);
  return {
    mine: (live.find((r) => r.member_id === myMemberId)?.emoji ?? null) as ReactionEmoji | null,
    groups: REACTION_EMOJIS.map((emoji) => ({ emoji, members: live.filter((r) => r.emoji === emoji).map((r) => r.member_id) })),
    total: live.length,
  };
}

/** Comments on an item, oldest first (newest at the bottom), deleted ones gone. */
export function commentsFor(d: SocialData, type: SocialEntity, id: string): Comment[] {
  return d.comments
    .filter((c) => c.entity_type === type && c.entity_id === id && !c.deleted_at)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

/**
 * Which items have comments or reactions from someone else since I last opened them (the dot).
 * Never opened counts as unseen.
 */
export function unseenItems(d: SocialData, myMemberId: string): Set<string> {
  const seenAt = new Map(d.seen.filter((s) => s.member_id === myMemberId).map((s) => [key(s.entity_type, s.entity_id), s.seen_at]));
  const out = new Set<string>();
  const check = (type: SocialEntity, id: string, at: string, by: string) => {
    if (by === myMemberId) return;
    const s = seenAt.get(key(type, id));
    if (!s || Date.parse(at) > Date.parse(s)) out.add(key(type, id));
  };
  for (const r of d.reactions) if (r.emoji) check(r.entity_type, r.entity_id, r.updated_at, r.member_id);
  for (const c of d.comments) if (!c.deleted_at) check(c.entity_type, c.entity_id, c.created_at, c.member_id);
  return out;
}

export const socialKey = key;

/** Optimistic reaction tap: same emoji removes, another replaces. */
export function withReaction(d: SocialData, o: { groupId: string; type: SocialEntity; id: string; memberId: string; emoji: ReactionEmoji }): SocialData {
  const now = new Date().toISOString();
  const existing = d.reactions.find((r) => r.entity_type === o.type && r.entity_id === o.id && r.member_id === o.memberId);
  const next = existing?.emoji === o.emoji ? null : o.emoji;
  return {
    ...d,
    reactions: existing
      ? d.reactions.map((r) => (r === existing ? { ...r, emoji: next, updated_at: now } : r))
      : [...d.reactions, { id: `temp-${o.type}-${o.id}-${o.memberId}`, group_id: o.groupId, entity_type: o.type, entity_id: o.id, member_id: o.memberId, emoji: next, updated_at: now }],
  };
}

/** Optimistic mark-seen. */
export function withSeen(d: SocialData, o: { groupId: string; type: SocialEntity; id: string; memberId: string }): SocialData {
  const now = new Date().toISOString();
  const rest = d.seen.filter((s) => !(s.member_id === o.memberId && s.entity_type === o.type && s.entity_id === o.id));
  return { ...d, seen: [...rest, { member_id: o.memberId, group_id: o.groupId, entity_type: o.type, entity_id: o.id, seen_at: now }] };
}

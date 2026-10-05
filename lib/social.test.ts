import { describe, expect, it } from "vitest";
import { commentsFor, EMPTY_SOCIAL, reactionSummary, unseenItems, withReaction, withSeen, type SocialData } from "./social";
import type { Comment, Reaction } from "./supabase/types";

const r = (member: string, emoji: Reaction["emoji"], at = "2026-10-05T10:00:00Z", id = "e1"): Reaction => ({ id: `r-${member}-${id}`, group_id: "g", entity_type: "expense", entity_id: id, member_id: member, emoji, updated_at: at });
const c = (member: string, at: string, id = "e1", deleted = false): Comment => ({ id: `c-${member}-${at}`, group_id: "g", entity_type: "expense", entity_id: id, member_id: member, body: "hi", client_id: null, created_at: at, deleted_at: deleted ? at : null });

describe("social helpers", () => {
  it("reaction summary: fixed order, counts, mine, removed ones ignored", () => {
    const d: SocialData = { ...EMPTY_SOCIAL, reactions: [r("me", "🔥"), r("a", "🔥"), r("b", "💀"), r("c", null)] };
    const s = reactionSummary(d, "expense", "e1", "me");
    expect(s.mine).toBe("🔥");
    expect(s.total).toBe(3);
    expect(s.groups.map((g) => [g.emoji, g.members.length])).toEqual([["💀", 1], ["😭", 0], ["🔥", 2], ["🙏", 0], ["🤡", 0], ["💸", 0]]);
  });

  it("tap toggles: add, switch, remove", () => {
    let d = withReaction(EMPTY_SOCIAL, { groupId: "g", type: "expense", id: "e1", memberId: "me", emoji: "🔥" });
    expect(reactionSummary(d, "expense", "e1", "me").mine).toBe("🔥");
    d = withReaction(d, { groupId: "g", type: "expense", id: "e1", memberId: "me", emoji: "💸" });
    expect(reactionSummary(d, "expense", "e1", "me").mine).toBe("💸");
    d = withReaction(d, { groupId: "g", type: "expense", id: "e1", memberId: "me", emoji: "💸" });
    expect(reactionSummary(d, "expense", "e1", "me").mine).toBeNull();
    expect(d.reactions).toHaveLength(1);
  });

  it("comments oldest first, deleted hidden", () => {
    const d: SocialData = { ...EMPTY_SOCIAL, comments: [c("a", "2026-10-05T12:00:00Z"), c("b", "2026-10-05T11:00:00Z"), c("a", "2026-10-05T13:00:00Z", "e1", true)] };
    expect(commentsFor(d, "expense", "e1").map((x) => x.created_at)).toEqual(["2026-10-05T11:00:00Z", "2026-10-05T12:00:00Z"]);
  });

  it("dot: others' activity after I last opened it; mine never counts", () => {
    const d: SocialData = {
      reactions: [r("a", "🔥", "2026-10-05T10:00:00Z", "e1"), r("me", "💀", "2026-10-05T12:00:00Z", "e2")],
      comments: [c("b", "2026-10-05T09:00:00Z", "e3")],
      seen: [{ member_id: "me", group_id: "g", entity_type: "expense", entity_id: "e3", seen_at: "2026-10-05T09:30:00Z" }],
    };
    expect([...unseenItems(d, "me")]).toEqual(["expense:e1"]);
    const after = withSeen(d, { groupId: "g", type: "expense", id: "e1", memberId: "me" });
    expect([...unseenItems(after, "me")]).toEqual([]);
  });
});

import { describeActivity } from "./activity";

describe("activity sentences for comments and nudges", () => {
  const row = (kind: string, payload: Record<string, unknown>) => ({ id: "1", group_id: "g", actor_member: "a", kind, entity_id: "x", payload, created_at: "", actor: { display_name: "Aman Rao", user_id: "u2" } });
  it("comment opens the item, quotes it", () => {
    expect(describeActivity(row("comment_added", { entity_type: "expense", entity_id: "e1", title: "Dinner", body: "that was NOT 900" }), "me")).toEqual({
      text: "Aman commented on Dinner: “that was NOT 900”",
      amount: null,
      target: { type: "expense", id: "e1" },
    });
  });
  it("nudge says you when it's me", () => {
    const line = describeActivity(row("nudge_sent", { to_name: "Vansh Gupta", amount: 34000, base_currency: "INR" }), "me", "Vansh Gupta");
    expect(line.text).toBe("Aman nudged you");
    expect(line.amount).toEqual({ value: 34000, currency: "INR" });
  });
});

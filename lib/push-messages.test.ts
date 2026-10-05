import { describe, expect, it } from "vitest";
import { pushMessages, type ActivityRecord, type PushContext, type PushMember } from "./push-messages";

const m = (id: string, name: string, user: string | null, level: PushMember["notify_level"] = "all", left = false): PushMember => ({
  id,
  user_id: user,
  display_name: name,
  notify_level: level,
  left_at: left ? "2026-01-01" : null,
});
const members = [m("mV", "Vansh Gupta", "uV"), m("mA", "Aman Rao", "uA"), m("mR", "Riya", "uR"), m("mZ", "Zoya", null), m("mL", "Left Guy", "uL", "all", true)];
const ctx = (over: Partial<PushContext> = {}): PushContext => ({
  group: { id: "g1", name: "Goa", emoji: "🏝️", base_currency: "INR" },
  members,
  expense: {
    id: "e1",
    title: "Dinner",
    payers: [{ member_id: "mV", amount_base: 120000 }],
    splits: ["mV", "mA", "mR", "mZ", "mL"].map((x) => ({ member_id: x, amount_base: 24000 })),
  },
  settlement: { id: "s1", from_member: "mA", to_member: "mV", amount_base: 50000 },
  ...over,
});
const act = (kind: string, actor: string, payload: Record<string, unknown> = {}, entity = "e1"): ActivityRecord => ({ id: "a1", group_id: "g1", actor_member: actor, kind, entity_id: entity, payload });
const users = (xs: { userId: string }[]) => xs.map((x) => x.userId).sort();

describe("push recipients and text", () => {
  it("expense: everyone in the split except me, ghosts and people who left; says what they owe", () => {
    const out = pushMessages(act("expense_created", "mV"), ctx());
    expect(users(out)).toEqual(["uA", "uR"]);
    expect(out[0]).toMatchObject({ title: "Settld · Goa", body: "Vansh added Dinner · ₹1,200 · you owe ₹240", url: "/g/g1?open=expense%3Ae1" });
  });

  it("expense: the payer gets 'you get back', someone square gets 'your share'; not in the split → nothing", () => {
    // Aman adds ₹2,400 Vansh paid, split 4 ways (₹600 each): Vansh gets back ₹1,800.
    const e = { id: "e2", title: "Dinner", amount_base: 240000, payers: [{ member_id: "mV", amount_base: 240000 }], splits: ["mV", "mA", "mR", "mZ"].map((x) => ({ member_id: x, amount_base: 60000 })) };
    const out = pushMessages(act("expense_created", "mA", {}, "e2"), ctx({ expense: e }));
    expect(out.find((x) => x.userId === "uV")?.body).toBe("Aman added Dinner · ₹2,400 · you get back ₹1,800");
    expect(out.find((x) => x.userId === "uR")?.body).toBe("Aman added Dinner · ₹2,400 · you owe ₹600");
    expect(users(out)).toEqual(["uR", "uV"]); // never Aman, who added it
    // Riya paid her own ₹600 share exactly: square.
    const even = { ...e, payers: [{ member_id: "mR", amount_base: 60000 }, { member_id: "mV", amount_base: 180000 }] };
    expect(pushMessages(act("expense_created", "mA", {}, "e2"), ctx({ expense: even })).find((x) => x.userId === "uR")?.body).toBe("Aman added Dinner · ₹2,400 · your share ₹600");
    // A payer who isn't in the split hears nothing.
    const notIn = { ...e, payers: [{ member_id: "mR", amount_base: 240000 }], splits: [{ member_id: "mV", amount_base: 240000 }] };
    expect(users(pushMessages(act("expense_created", "mA", {}, "e2"), ctx({ expense: notIn })))).toEqual(["uV"]);
  });

  it("expense edited: only people whose share changed (incl. newly added), with the new share", () => {
    const e = { id: "e1", title: "Dinner", amount_base: 240000, payers: [{ member_id: "mA", amount_base: 240000 }], splits: [
      { member_id: "mV", amount_base: 80000 }, { member_id: "mA", amount_base: 80000 }, { member_id: "mR", amount_base: 80000 },
    ] };
    const a = act("expense_updated", "mA", { previous_splits: { mV: 60000, mA: 60000, mR: 80000, mL: 60000 } });
    const out = pushMessages(a, ctx({ expense: e }));
    expect(out).toEqual([{ userId: "uV", title: "Settld · Goa", body: "Aman changed Dinner · your share is now ₹800", url: "/g/g1?open=expense%3Ae1", tag: "expense_updated:e1" }]);
    // Riya wasn't in it before: now she is.
    const added = pushMessages(act("expense_updated", "mA", { previous_splits: { mV: 80000, mA: 80000 } }), ctx({ expense: e }));
    expect(users(added)).toEqual(["uR"]);
  });

  it("expense deleted: everyone who had a share, except whoever deleted it", () => {
    const out = pushMessages(act("expense_deleted", "mA"), ctx());
    expect(users(out)).toEqual(["uR", "uV"]);
    expect(out[0]).toMatchObject({ body: "Aman deleted Dinner", url: "/g/g1?tab=activity" });
  });

  it("expense pushes respect money-only and off", () => {
    const quiet = ctx({ members: members.map((x) => (x.id === "mR" ? { ...x, notify_level: "money" } : x.id === "mA" ? { ...x, notify_level: "off" } : x)) });
    expect(users(pushMessages(act("expense_created", "mV"), quiet))).toEqual(["uR"]);
    expect(users(pushMessages(act("expense_deleted", "mV"), quiet))).toEqual(["uR"]);
  });

  it("someone paid me / receiver recorded it", () => {
    expect(pushMessages(act("settlement_recorded", "mA", {}, "s1"), ctx())).toEqual([
      { userId: "uV", title: "Settld · Goa", body: "Aman paid you ₹500", url: "/g/g1?open=settlement%3As1", tag: "settlement_recorded:s1" },
    ]);
    expect(pushMessages(act("settlement_recorded", "mV", {}, "s1"), ctx())[0]).toMatchObject({ userId: "uA", body: "Vansh recorded your ₹500 payment" });
  });

  it("confirmed / disputed go to whoever paid", () => {
    expect(pushMessages(act("settlement_confirmed", "mV", {}, "s1"), ctx())[0]).toMatchObject({ userId: "uA", body: "Vansh confirmed your ₹500 payment ✓" });
    expect(pushMessages(act("settlement_disputed", "mV", {}, "s1"), ctx())[0]).toMatchObject({ userId: "uA", body: "Vansh says they didn't get your ₹500" });
  });

  it("comments: people in the expense, quoted; not on money-only", () => {
    const a = act("comment_added", "mA", { entity_type: "expense", entity_id: "e1", body: "that was NOT 1200" }, "c1");
    const out = pushMessages(a, ctx());
    expect(users(out)).toEqual(["uR", "uV"]);
    expect(out[0].body).toBe("Aman on Dinner: “that was NOT 1200”");
    const quiet = ctx({ members: members.map((x) => (x.id === "mR" ? { ...x, notify_level: "money" } : x)) });
    expect(users(pushMessages(a, quiet))).toEqual(["uV"]);
  });

  it("nudges: the person nudged, with the stored template", () => {
    const a = act("nudge_sent", "mV", { to_member: "mA", level: 3, template: 0, amount: 34000, base_currency: "INR", days: 9 }, "n1");
    expect(pushMessages(a, ctx())).toEqual([{ userId: "uA", title: "Settld · Goa", body: "Aman. It's been 9 days. The ₹340 misses you.", url: "/g/g1?tab=balances", tag: "nudge_sent:n1" }]);
  });

  it("off means off; never myself even from another member row; unknown kinds send nothing", () => {
    const off = ctx({ members: members.map((x) => ({ ...x, notify_level: "off" as const })) });
    expect(pushMessages(act("expense_created", "mV"), off)).toEqual([]);
    const twin = ctx({ members: [...members, m("mV2", "Vansh again", "uV")], expense: { id: "e1", title: "X", payers: [{ member_id: "mA", amount_base: 2 }], splits: [{ member_id: "mV2", amount_base: 1 }, { member_id: "mA", amount_base: 1 }] } });
    expect(users(pushMessages(act("expense_created", "mV"), twin))).toEqual(["uA"]);
    expect(pushMessages(act("member_joined", "mA"), ctx())).toEqual([]);
    expect(pushMessages(act("expense_created", "mV"), ctx({ expense: null }))).toEqual([]);
  });

  it("ghost claimed: whoever added them, else the admins", () => {
    const a = act("ghost_claimed", "mZ", { ghost_name: "Zoya", added_by: "mV" }, "mZ");
    const claimed = ctx({ members: members.map((x) => (x.id === "mZ" ? { ...x, user_id: "uZ", display_name: "Zoya Khan" } : x)) });
    expect(pushMessages(a, claimed)).toEqual([{ userId: "uV", title: "Settld · Goa", body: "Zoya joined Goa", url: "/g/g1?open=members", tag: "ghost_claimed:mZ" }]);
    const noAdder = ctx({ members: claimed.members.map((x) => (x.id === "mA" ? { ...x, role: "admin" } : x)) });
    expect(users(pushMessages(act("ghost_claimed", "mZ", { ghost_name: "Zoya" }, "mZ"), noAdder))).toEqual(["uA"]);
  });
});

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
  it("expense: everyone in it except me, ghosts and people who left; shows their share", () => {
    const out = pushMessages(act("expense_created", "mV"), ctx());
    expect(users(out)).toEqual(["uA", "uR"]);
    expect(out[0]).toMatchObject({ title: "🏝️ Goa", body: "Vansh added Dinner · your share ₹240.00", url: "/g/g1?open=expense%3Ae1" });
  });

  it("someone paid me / receiver recorded it", () => {
    expect(pushMessages(act("settlement_recorded", "mA", {}, "s1"), ctx())).toEqual([
      { userId: "uV", title: "🏝️ Goa", body: "Aman paid you ₹500.00", url: "/g/g1?open=settlement%3As1", tag: "settlement_recorded:s1" },
    ]);
    expect(pushMessages(act("settlement_recorded", "mV", {}, "s1"), ctx())[0]).toMatchObject({ userId: "uA", body: "Vansh recorded your ₹500.00 payment" });
  });

  it("confirmed / disputed go to whoever paid", () => {
    expect(pushMessages(act("settlement_confirmed", "mV", {}, "s1"), ctx())[0]).toMatchObject({ userId: "uA", body: "Vansh confirmed your ₹500.00 payment ✓" });
    expect(pushMessages(act("settlement_disputed", "mV", {}, "s1"), ctx())[0]).toMatchObject({ userId: "uA", body: "Vansh says they didn't get your ₹500.00" });
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
    expect(pushMessages(a, ctx())).toEqual([{ userId: "uA", title: "🏝️ Goa", body: "Aman. It's been 9 days. The ₹340.00 misses you.", url: "/g/g1?settle=1", tag: "nudge_sent:n1" }]);
  });

  it("off means off; never myself even from another member row; unknown kinds send nothing", () => {
    const off = ctx({ members: members.map((x) => ({ ...x, notify_level: "off" as const })) });
    expect(pushMessages(act("expense_created", "mV"), off)).toEqual([]);
    const twin = ctx({ members: [...members, m("mV2", "Vansh again", "uV")], expense: { id: "e1", title: "X", payers: [{ member_id: "mA", amount_base: 1 }], splits: [{ member_id: "mV2", amount_base: 1 }] } });
    expect(users(pushMessages(act("expense_created", "mV"), twin))).toEqual(["uA"]);
    expect(pushMessages(act("member_joined", "mA"), ctx())).toEqual([]);
    expect(pushMessages(act("expense_created", "mV"), ctx({ expense: null }))).toEqual([]);
  });
});

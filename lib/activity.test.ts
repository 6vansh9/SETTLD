import { describe, expect, it, vi } from "vitest";
import { describeActivity, pillText, type ActivityRow } from "./activity";
import { createThrottle, presenceText } from "./presence";

const ME = "user-me";
const row = (kind: string, payload: Record<string, unknown> = {}, actor = { display_name: "Aman Rao", user_id: "user-aman" }): ActivityRow => ({
  id: "a1",
  group_id: "g",
  actor_member: "m",
  kind,
  entity_id: "e1",
  payload,
  created_at: "2026-10-04T10:00:00Z",
  actor,
});
const me = { display_name: "Vansh Gupta", user_id: ME };

describe("describeActivity", () => {
  it("expenses", () => {
    expect(describeActivity(row("expense_created", { title: "Dinner", amount: 240000, currency: "INR" }), ME)).toEqual({
      text: "Aman added Dinner",
      amount: { value: 240000, currency: "INR" },
      target: { type: "expense", id: "e1" },
    });
    expect(describeActivity(row("expense_created", { title: "Cab" }, me), ME).text).toBe("You added Cab");
    expect(describeActivity(row("expense_deleted", { title: "Cab" }), ME)).toMatchObject({ text: "Aman deleted Cab", target: null });
  });

  it("payments", () => {
    const paid = describeActivity(row("settlement_recorded", { from: "Vansh Gupta", to: "Aman Rao", amount: 30000, currency: "INR" }, me), ME);
    expect(paid).toMatchObject({ text: "You paid Aman", amount: { value: 30000, currency: "INR" }, target: { type: "settlement", id: "e1" } });
    expect(describeActivity(row("settlement_confirmed", { from: "Vansh Gupta", to: "Aman Rao" }), ME).text).toBe("Aman confirmed Vansh's payment");
    // I'm the receiver, not the actor: still "You"
    expect(describeActivity(row("settlement_recorded", { from: "Aman Rao", to: "Vansh Gupta" }), ME, "Vansh Gupta").text).toBe("Aman paid You");
    expect(describeActivity(row("settlement_confirmed", { from: "Vansh Gupta", to: "Aman Rao" }), ME, "Vansh Gupta").text).toBe("Aman confirmed your payment");
    expect(describeActivity(row("settlement_disputed", { from: "Vansh Gupta", to: "Aman Rao" }), ME).text).toBe("Aman disputed Vansh's payment");
  });

  it("members and ghosts", () => {
    expect(describeActivity(row("ghost_claimed", { ghost_name: "Zoya" }, { display_name: "Priya Shah", user_id: "p" }), ME).text).toBe("Priya joined (saved as Zoya)");
    expect(describeActivity(row("ghost_claimed", {}, { display_name: "Priya Shah", user_id: "p" }), ME).text).toBe("Priya joined");
    expect(describeActivity(row("member_removed", { name: "Kabir Das" }), ME).text).toBe("Aman removed Kabir");
    expect(describeActivity(row("member_joined"), ME)).toMatchObject({ text: "Aman joined", target: { type: "members" } });
  });

  it("never crashes on odd rows", () => {
    expect(describeActivity({ ...row("weird"), actor: null, payload: null as unknown as Record<string, unknown> }, ME).text).toBe("Someone made a change");
    expect(describeActivity(row("expense_created", { amount: "oops", currency: "XYZ" }), ME).amount).toBeNull();
  });

  it("pill wording", () => {
    expect(pillText({ text: "Aman paid Vansh", amount: null, target: null })).toBe("Aman just paid Vansh");
    expect(pillText({ text: "Zoya was claimed by Priya", amount: null, target: null })).toBe("Zoya was claimed by Priya");
  });
});

describe("presenceText", () => {
  const names = new Map([["a", "Aman Rao"], ["p", "Priya Shah"], ["me", "Vansh"]]);
  it("ignores me and idle people", () => {
    expect(presenceText([{ member_id: "me", typing: true, screen: "add-expense" }, { member_id: "a", typing: false, screen: "group" }], "me", names)).toBeNull();
  });
  it("one or several people", () => {
    expect(presenceText([{ member_id: "a", typing: true, screen: "add-expense" }], "me", names)).toBe("Aman is adding an expense…");
    expect(presenceText([{ member_id: "a", typing: true, screen: "settle" }], "me", names)).toBe("Aman is settling up…");
    expect(
      presenceText([{ member_id: "a", typing: true, screen: "add-expense" }, { member_id: "p", typing: true, screen: "add-expense" }], "me", names),
    ).toBe("Aman and 1 other are adding expenses…");
  });
  it("dedupes the same member across tabs", () => {
    const s = { member_id: "a", typing: true, screen: "add-expense" as const };
    expect(presenceText([s, s], "me", names)).toBe("Aman is adding an expense…");
  });
});

describe("createThrottle", () => {
  it("sends at most once per second, always the latest value", () => {
    vi.useFakeTimers();
    let t = 0;
    const sent: number[] = [];
    const th = createThrottle((v: number) => sent.push(v), 1000, () => t);
    th.push(1); // immediate
    th.push(2);
    th.push(3); // coalesced → trailing 3
    expect(sent).toEqual([1]);
    t = 1000;
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([1, 3]);
    vi.useRealTimers();
  });
});

describe("ghost claimed wording", () => {
  it("no 'saved as' when the names match", () => {
    const r = { id: "1", group_id: "g", actor_member: "m", kind: "ghost_claimed", entity_id: "m", payload: { ghost_name: "Rahul" }, created_at: "", actor: { display_name: "Rahul Mehta", user_id: "r" } };
    expect(describeActivity(r, "me").text).toBe("Rahul joined");
  });
});

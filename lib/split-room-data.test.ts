import { describe, expect, it } from "vitest";
import { describeActivity } from "./activity";
import { billInputs, claimantsOf, roomState, sharesOf, withClaim, type RoomData } from "./split-room-data";
import { computeBill } from "./splitRoom";

const room = {
  id: "r", code: "K7M4QX", group_id: "g", name: "Dinner", host_member: "a",
  tax_kind: "percent", tax_value: 1800, service_kind: "amount", service_value: 0, tip_kind: "percent", tip_value: 1000,
  status: "open", paid_by: null, expense_id: null, created_at: "", expires_at: "2026-10-05T12:00:00Z", closed_at: null, updated_at: "",
} as RoomData["room"];
const item = (id: string, price: number, qty = 1) => ({ id, room_id: "r", name: id, price, qty, position: 0, deleted_at: null, created_at: "", updated_at: "" });
const d: RoomData = { room, items: [item("x", 10000), item("y", 5000, 2)], claims: [] };

describe("room data helpers", () => {
  it("withClaim adds, changes and un-claims (shares 0) without losing other claims", () => {
    let r = withClaim(d, "x", "b", 1);
    r = withClaim(r, "x", "a", 1);
    expect(claimantsOf(r, "x").map((c) => c.member_id)).toEqual(["a", "b"]);
    r = withClaim(r, "x", "b", 0);
    expect(claimantsOf(r, "x").map((c) => c.member_id)).toEqual(["a"]);
    expect(sharesOf(r, "x", "b")).toBe(0);
    expect(r.claims).toHaveLength(2);
    expect(d.claims).toHaveLength(0); // pure
  });

  it("billInputs feeds computeBill with the room's charges", () => {
    const r = withClaim(withClaim(d, "x", "a", 1), "y", "b", 1);
    const bill = computeBill(...(Object.values(billInputs(r)) as Parameters<typeof computeBill>));
    expect(bill.subtotal).toBe(20000);
    expect(bill.tax).toBe(3600);
    expect(bill.tip).toBe(2000);
    expect(bill.people.reduce((a, p) => a + p.total, 0)).toBe(bill.total);
  });

  it("roomState: open until expires_at, then expired; closed states win", () => {
    expect(roomState(room, Date.parse("2026-10-05T11:59:00Z"))).toBe("open");
    expect(roomState(room, Date.parse("2026-10-05T12:00:00Z"))).toBe("expired");
    expect(roomState({ ...room, status: "finalized" }, 0)).toBe("finalized");
    expect(roomState({ ...room, status: "cancelled" }, 0)).toBe("cancelled");
  });
});

describe("room activity", () => {
  const row = (kind: string, payload: Record<string, unknown>) => ({
    id: "1", group_id: "g", actor_member: "a", kind, entity_id: "r", payload, created_at: "",
    actor: { display_name: "Aman Rao", user_id: "u2" },
  });
  it("opened → links to the room; finalized → links to the expense with the amount", () => {
    expect(describeActivity(row("room_opened", { name: "Dinner", code: "K7M4QX" }), "me")).toEqual({
      text: "Aman opened a Split Room: Dinner", amount: null, target: { type: "room", code: "K7M4QX" },
    });
    expect(describeActivity(row("room_finalized", { name: "Dinner", expense_id: "e1", amount: 498880, base_currency: "INR" }), "me")).toEqual({
      text: "Aman finalized Dinner", amount: { value: 498880, currency: "INR" }, target: { type: "expense", id: "e1" },
    });
    expect(describeActivity(row("room_cancelled", { name: "Dinner" }), "me").text).toBe("Aman closed Dinner");
  });
});

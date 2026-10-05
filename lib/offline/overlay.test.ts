import { describe, expect, it } from "vitest";
import type { GroupBalance, Settlement } from "@/lib/supabase/types";
import { createParams, previewExpense, updateParams } from "./expense-queue";
import { overlayBalances, overlayExpenses, overlaySettlements } from "./overlay";
import type { QueueItem } from "./types";

const G = "g1", U = "u1";
const args = (title: string, amount: number) => ({
  title, amount, currency: "INR" as const, fxRate: "1", category: "food" as const, date: "2026-10-05", note: null, splitType: "equal" as const,
  payers: [{ member_id: "mA", amount }], splits: [{ member_id: "mA", amount: amount / 2, raw_value: null }, { member_id: "mB", amount: amount / 2, raw_value: null }],
});
const base = (id: string, cid: string | null = null) => ({ id, group_id: G, created_by: U, client_id: cid, created_at: "2026-10-05T10:00:00Z" });
const serverRow = previewExpense(base("e1"), args("Lunch", 60000));
const bal = (): GroupBalance[] => [
  { group_id: G, member_id: "mA", paid: 60000, owed: 30000, settlements_sent: 0, settlements_received: 0, net: 30000 },
  { group_id: G, member_id: "mB", paid: 0, owed: 30000, settlements_sent: 0, settlements_received: 0, net: -30000 },
];
const create = (cid: string, title: string, amount: number, status: "pending" | "failed" = "pending"): QueueItem => ({
  kind: "create_expense", id: cid, userId: U, groupId: G, createdAt: 1, status, label: title, params: createParams(args(title, amount), cid, G), preview: previewExpense(base(`temp-${cid}`, cid), args(title, amount)),
});

describe("offline overlay", () => {
  it("queued creates appear marked; failed ones too, but only pending ones move balances", () => {
    const q = [create("c1", "Cab", 20000), create("c2", "Chai", 4000, "failed")];
    const list = overlayExpenses([serverRow], q, G, U);
    expect(list).toHaveLength(3);
    expect(list.find((e) => e.title === "Cab")?.sync).toBe("pending");
    expect(list.find((e) => e.title === "Chai")?.sync).toBe("failed");
    const b = overlayBalances(bal(), q, G, U, { expenseClientIds: new Set(), settlementClientIds: new Set() });
    expect(b.find((x) => x.member_id === "mB")?.net).toBe(-40000); // only the pending ₹200 cab
  });

  it("once the server has the client_id, the preview steps aside (no double counting)", () => {
    const synced = previewExpense(base("e9", "c1"), args("Cab", 20000));
    const q = [create("c1", "Cab", 20000)];
    expect(overlayExpenses([synced, serverRow], q, G, U).filter((e) => e.title === "Cab")).toHaveLength(1);
    const b = overlayBalances(bal(), q, G, U, { expenseClientIds: new Set(["c1"]), settlementClientIds: new Set() });
    expect(b.find((x) => x.member_id === "mB")?.net).toBe(-30000);
  });

  it("queued edit replaces the row and moves balances by the difference; queued delete hides it", () => {
    const edited = previewExpense(serverRow, args("Lunch", 100000));
    const upd: QueueItem = { kind: "update_expense", id: "x", userId: U, groupId: G, createdAt: 1, status: "pending", label: "", params: updateParams("e1", args("Lunch", 100000)), preview: edited, before: serverRow };
    expect(overlayExpenses([serverRow], [upd], G, U)[0].amount).toBe(100000);
    expect(overlayBalances(bal(), [upd], G, U, { expenseClientIds: new Set(), settlementClientIds: new Set() }).find((x) => x.member_id === "mB")?.net).toBe(-50000);
    const del: QueueItem = { kind: "delete_expense", id: "y", userId: U, groupId: G, createdAt: 1, status: "pending", label: "", params: { p_expense_id: "e1" }, before: serverRow };
    expect(overlayExpenses([serverRow], [del], G, U)).toHaveLength(0);
    expect(overlayBalances(bal(), [del], G, U, { expenseClientIds: new Set(), settlementClientIds: new Set() }).every((x) => x.net === 0)).toBe(true);
  });

  it("other people's and other groups' items never show", () => {
    const q = [{ ...create("c1", "Cab", 20000), userId: "someone-else" }, { ...create("c2", "X", 100), groupId: "g2" }];
    expect(overlayExpenses([serverRow], q, G, U)).toHaveLength(1);
  });

  it("queued payments appear and count", () => {
    const s: Settlement = { id: "temp-s1", group_id: G, from_member: "mB", to_member: "mA", amount: 30000, currency: "INR", amount_base: 30000, method: "cash", status: "confirmed", client_id: "s1", created_by: U, created_at: "", updated_at: "", deleted_at: null };
    const q: QueueItem[] = [{ kind: "record_settlement", id: "s1", userId: U, groupId: G, createdAt: 1, status: "pending", label: "", params: {}, preview: s }];
    expect(overlaySettlements([], q, G, U)[0].sync).toBe("pending");
    expect(overlayBalances(bal(), q, G, U, { expenseClientIds: new Set(), settlementClientIds: new Set() }).every((x) => x.net === 0)).toBe(true);
  });

  it("RPC params keep the client_id; edits carry the expense id", () => {
    expect(createParams(args("A", 100), "cid", G)).toMatchObject({ p_group_id: G, p_client_id: "cid", p_amount: 100 });
    const u = updateParams("e1", args("A", 100));
    expect(u).toMatchObject({ p_expense_id: "e1", p_amount: 100 });
    expect("p_client_id" in u).toBe(false);
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Expense, GroupBalance } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type ExpenseWithLines = Expense & {
  payers: { member_id: string; amount_base: number }[];
  splits: { member_id: string; amount_base: number; split_type: Database["public"]["Tables"]["expense_splits"]["Row"]["split_type"]; raw_value: number | null }[];
};

const EXPENSE_SELECT =
  "*, payers:expense_payers(member_id, amount_base), splits:expense_splits(member_id, amount_base, split_type, raw_value)";

/** Live (not deleted) expenses, newest first. */
export async function fetchExpenses(supabase: Client, groupId: string): Promise<ExpenseWithLines[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_SELECT)
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as ExpenseWithLines[]).map(normalizeExpense);
}

/** One expense with its lines (swapping an optimistic row for the server's). Null if gone. */
export async function fetchExpense(supabase: Client, id: string): Promise<ExpenseWithLines | null> {
  const { data, error } = await supabase.from("expenses").select(EXPENSE_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizeExpense(data as unknown as ExpenseWithLines) : null;
}

/** bigint/numeric columns can arrive as strings; money must be integers. */
function normalizeExpense(e: ExpenseWithLines): ExpenseWithLines {
  return {
    ...e,
    amount: Number(e.amount),
    amount_base: Number(e.amount_base),
    payers: e.payers.map((p) => ({ ...p, amount_base: Number(p.amount_base) })),
    splits: e.splits.map((s) => ({ ...s, amount_base: Number(s.amount_base), raw_value: s.raw_value === null ? null : Number(s.raw_value) })),
  };
}

export async function fetchBalances(supabase: Client, groupId: string): Promise<GroupBalance[]> {
  const { data, error } = await supabase.from("group_balances").select("*").eq("group_id", groupId);
  if (error) throw error;
  return data.map(normalizeBalance);
}

/** Balances across every group you're in (RLS scopes the view to your groups). */
export async function fetchAllBalances(supabase: Client): Promise<GroupBalance[]> {
  const { data, error } = await supabase.from("group_balances").select("*");
  if (error) throw error;
  return data.map(normalizeBalance);
}

function normalizeBalance(b: GroupBalance): GroupBalance {
  return {
    ...b,
    paid: Number(b.paid),
    owed: Number(b.owed),
    settlements_sent: Number(b.settlements_sent),
    settlements_received: Number(b.settlements_received),
    net: Number(b.net),
  };
}

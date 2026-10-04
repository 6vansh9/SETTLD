import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Settlement } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

/** Live (not deleted) settlements, newest first. Disputed ones are included (shown, not counted). */
export async function fetchSettlements(supabase: Client, groupId: string): Promise<Settlement[]> {
  const { data, error } = await supabase
    .from("settlements")
    .select("*")
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((s) => ({ ...s, amount: Number(s.amount), amount_base: Number(s.amount_base) }));
}

export async function fetchSettlement(supabase: Client, id: string): Promise<Settlement | null> {
  const { data, error } = await supabase.from("settlements").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { ...data, amount: Number(data.amount), amount_base: Number(data.amount_base) } : null;
}

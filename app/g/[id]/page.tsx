import { notFound } from "next/navigation";
import { GroupScreen } from "@/components/features/groups/GroupScreen";
import { requireOnboarded } from "@/lib/auth";
import { fetchBalances, fetchExpenses } from "@/lib/expenses-data";
import { fetchGroup } from "@/lib/groups-data";
import { fetchSettlements } from "@/lib/settlements-data";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return { title: "Settld" };
  const group = await fetchGroup(createClient(), params.id).catch(() => null);
  return { title: group ? `${group.name} · Settld` : "Settld" };
}

export default async function GroupPage({ params }: { params: { id: string } }) {
  const profile = await requireOnboarded(`/g/${params.id}`);
  if (!UUID.test(params.id)) notFound();
  // RLS returns nothing for groups you're not in, so non-members get a 404.
  const supabase = createClient();
  const group = await fetchGroup(supabase, params.id);
  if (!group) notFound();
  const [expenses, balances, settlements] = await Promise.all([
    fetchExpenses(supabase, group.id),
    fetchBalances(supabase, group.id),
    fetchSettlements(supabase, group.id),
  ]);
  return (
    <GroupScreen
      initialGroup={group}
      initialExpenses={expenses}
      initialBalances={balances}
      initialSettlements={settlements}
      myUserId={profile.id}
    />
  );
}

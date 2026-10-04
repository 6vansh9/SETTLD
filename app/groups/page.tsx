import { GroupsHome } from "@/components/features/groups/GroupsHome";
import { requireOnboarded } from "@/lib/auth";
import { fetchAllBalances } from "@/lib/expenses-data";
import { getRates } from "@/lib/fx";
import { fetchGroups } from "@/lib/groups-data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Groups · Settld" };

export default async function GroupsPage() {
  const profile = await requireOnboarded("/groups");
  const supabase = createClient();
  const [groups, balances] = await Promise.all([fetchGroups(supabase), fetchAllBalances(supabase)]);
  // Latest cached (or freshly fetched) rates into my default currency, for the overall total.
  const quotes = await getRates(
    groups
      .filter((g) => g.base_currency !== profile.default_currency)
      .map((g) => ({ base: g.base_currency, quote: profile.default_currency })),
  );
  const rates = Object.fromEntries(Object.entries(quotes).map(([pair, q]) => [pair, q.rate]));
  return <GroupsHome initialGroups={groups} initialBalances={balances} initialProfile={profile} rates={rates} />;
}

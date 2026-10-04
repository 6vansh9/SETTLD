import { ActivityFeed } from "@/components/features/activity/ActivityFeed";
import { fetchMyActivity } from "@/lib/activity-data";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Activity · Settld" };

export default async function ActivityPage() {
  const profile = await requireOnboarded("/activity");
  const supabase = createClient();
  const [rows, { data: groups }] = await Promise.all([fetchMyActivity(supabase), supabase.from("groups").select("id")]);
  return <ActivityFeed initialRows={rows} groupIds={(groups ?? []).map((g) => g.id)} myUserId={profile.id} myDisplayName={profile.name} />;
}

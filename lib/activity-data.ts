import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityRow } from "@/lib/activity";
import type { Pastel } from "@/lib/pastels";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type FeedRow = ActivityRow & { group?: { name: string; color: Pastel; emoji: string } | null };

const SELECT = "*, actor:group_members!activity_actor_member_fkey(display_name, user_id, profile:profiles(avatar_color))";

/** One group's activity, newest first. */
export async function fetchGroupActivity(supabase: Client, groupId: string, limit = 150): Promise<FeedRow[]> {
  const { data, error } = await supabase.from("activity").select(SELECT).eq("group_id", groupId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as unknown as FeedRow[];
}

/** Everything across my groups (RLS scopes it), with each group's name and color for the stripe. */
export async function fetchMyActivity(supabase: Client, limit = 200): Promise<FeedRow[]> {
  const { data, error } = await supabase
    .from("activity")
    .select(`${SELECT}, group:groups(name, color, emoji)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as FeedRow[];
}

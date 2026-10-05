import type { SupabaseClient } from "@supabase/supabase-js";
import type { Pastel } from "@/lib/pastels";
import type { Database, Group, GroupMember } from "@/lib/supabase/types";

/** Works with both the browser and the server Supabase client. */
type Client = SupabaseClient<Database>;

export type MemberWithProfile = GroupMember & {
  profile: { avatar_color: Pastel; upi_id: string | null; avatar_url?: string | null } | null;
};
export type GroupWithMembers = Group & { members: MemberWithProfile[] };

const GROUP_SELECT =
  "*, members:group_members(id, group_id, user_id, display_name, is_ghost, role, joined_at, left_at, profile:profiles(avatar_color, upi_id, avatar_url))";

function sortMembers(group: GroupWithMembers): GroupWithMembers {
  // Real members first in join order, ghosts after.
  const members = [...group.members].sort(
    (a, b) => Number(a.is_ghost) - Number(b.is_ghost) || a.joined_at.localeCompare(b.joined_at),
  );
  return { ...group, members };
}

export async function fetchGroups(supabase: Client): Promise<GroupWithMembers[]> {
  const { data, error } = await supabase.from("groups").select(GROUP_SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as GroupWithMembers[]).map(sortMembers);
}

export async function fetchGroup(supabase: Client, id: string): Promise<GroupWithMembers | null> {
  const { data, error } = await supabase.from("groups").select(GROUP_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? sortMembers(data as unknown as GroupWithMembers) : null;
}

/** The live group share link token (any member can read it). */
export async function fetchInviteToken(supabase: Client, groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("invites")
    .select("token")
    .eq("group_id", groupId)
    .is("ghost_member_id", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data?.token ?? null;
}

/** People currently in the group (pickers, member strip, counts). Left members stay on old expenses. */
export function activeMembers(group: GroupWithMembers): MemberWithProfile[] {
  return group.members.filter((m) => !m.left_at);
}

export function myMember(group: GroupWithMembers, userId: string): MemberWithProfile | undefined {
  return group.members.find((m) => m.user_id === userId && !m.left_at);
}

/** Avatar props for a member: their profile color, or a dashed ghost. */
export function memberAvatar(m: MemberWithProfile) {
  // Ghosts never have photos (no account, no profile).
  return {
    name: m.display_name,
    color: m.profile?.avatar_color ?? ("lilac" as Pastel),
    ghost: m.is_ghost,
    photo: m.is_ghost ? null : (m.profile?.avatar_url ?? null),
  };
}

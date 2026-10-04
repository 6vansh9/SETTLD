import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { defaultProfileName, normalizeProfile } from "@/lib/profile-defaults";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

type ServerClient = ReturnType<typeof createClient>;

/**
 * Create the profile row if it's missing (e.g. the user signed up before 0001_profiles.sql ran).
 * Upsert with ignoreDuplicates = INSERT … ON CONFLICT DO NOTHING, so it never overwrites a row
 * the sign-up trigger created concurrently. Returns null only if the insert itself fails.
 */
async function ensureProfile(supabase: ServerClient, user: User): Promise<Profile | null> {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, name: defaultProfileName(user.user_metadata, user.email) },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[auth] could not create missing profile", { userId: user.id, error: error.message });
    return null;
  }
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data ? normalizeProfile(data) : null;
}

/**
 * Current user and their profile (server only). `profile` is only null when there's no user,
 * or when a missing profile couldn't be created (e.g. the profiles table doesn't exist yet).
 */
export async function getUserAndProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { user, profile: profile ? normalizeProfile(profile) : await ensureProfile(supabase, user) };
}

/** For app screens: signed in and onboarded, otherwise redirect. */
export async function requireOnboarded(currentPath: string): Promise<Profile> {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (!profile?.onboarded_at) redirect(`/onboarding?next=${encodeURIComponent(currentPath)}`);
  return profile;
}

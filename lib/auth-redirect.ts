import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/** Where to send a user right after sign-in: onboarding first if they haven't finished it. */
export async function postSignInPath(supabase: SupabaseClient<Database>, next: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/login?error=auth";
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.onboarded_at ? next : `/onboarding?next=${encodeURIComponent(next)}`;
}

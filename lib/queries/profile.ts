"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { normalizeProfile } from "@/lib/profile-defaults";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ProfileUpdate } from "@/lib/supabase/types";

export const profileKey = ["profile"] as const;

async function fetchProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data ? normalizeProfile(data) : null;
}

/** The signed-in user's profile. Pass the server-fetched row as initialData to skip a round trip. */
export function useProfile(initialData?: Profile | null) {
  return useQuery({ queryKey: profileKey, queryFn: fetchProfile, initialData });
}

/** Optimistic profile update: the cache changes immediately and rolls back on error. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      // Use the session, not the query cache: the cache can hold a stale `null` from before
      // the profile row existed (e.g. a user who signed up before the migration ran).
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("profiles").update(patch).eq("id", user.id).select().single();
      if (error) throw error;
      return normalizeProfile(data);
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: profileKey });
      const previous = queryClient.getQueryData<Profile | null>(profileKey);
      if (previous) queryClient.setQueryData<Profile>(profileKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (_err, _patch, context) => {
      queryClient.setQueryData(profileKey, context?.previous);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileKey, data);
    },
  });
}

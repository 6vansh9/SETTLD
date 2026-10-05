"use client";

import { pathFromPublicUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";

/** Best-effort delete of a replaced/removed photo in our bucket (storage RLS decides who may). */
export async function removeStoredPhoto(bucket: "avatars" | "group-covers", url: string | null | undefined): Promise<void> {
  const path = pathFromPublicUrl(url, bucket);
  if (!path) return;
  const { error } = await createClient().storage.from(bucket).remove([path]);
  if (error) console.warn("[photos] couldn't remove the old file", error.message);
}

/** Is the signed-in user a Google user with a profile picture? */
export async function hasGooglePhoto(): Promise<boolean> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return false;
  const providers = [user.app_metadata?.provider, ...((user.app_metadata?.providers as string[] | undefined) ?? [])];
  const meta = user.user_metadata ?? {};
  return providers.includes("google") && (typeof meta.avatar_url === "string" || typeof meta.picture === "string");
}

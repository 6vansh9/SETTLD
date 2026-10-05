"use client";

import { Camera, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { hasGooglePhoto, removeStoredPhoto } from "@/lib/photo-storage";
import { useProfile, useUpdateProfile } from "@/lib/queries/profile";
import type { Profile } from "@/lib/supabase/types";
import { usePhotoFlow } from "./PhotoFlow";

/** Add / Change / Remove profile photo, plus "Use my Google photo" for Google accounts. */
export function ProfilePhotoControls({ initialProfile }: { initialProfile: Profile }) {
  const { data } = useProfile(initialProfile);
  const profile = data ?? initialProfile;
  const update = useUpdateProfile();
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hasGooglePhoto().then(setGoogle);
  }, []);

  const flow = usePhotoFlow({
    kind: "avatar",
    folder: profile.id,
    onUploaded: async (url) => {
      const old = profile.avatar_url;
      await update.mutateAsync({ avatar_url: url });
      if (old && old !== url) void removeStoredPhoto("avatars", old);
    },
  });

  const useGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/avatar/google", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Couldn't get your Google photo");
      flow.fromBlob(await res.blob());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get your Google photo");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    const old = profile.avatar_url;
    try {
      await update.mutateAsync({ avatar_url: null });
      void removeStoredPhoto("avatars", old);
    } catch {
      setError("Couldn't remove it. Try again.");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="h-11 px-4 text-[14px]" onClick={flow.pick}>
          <Camera className="size-4" />
          {profile.avatar_url ? "Change photo" : "Add photo"}
        </Button>
        {google && (
          <Button variant="secondary" className="h-11 px-4 text-[14px]" onClick={useGoogle} disabled={busy}>
            {busy ? "Getting it…" : "Use my Google photo"}
          </Button>
        )}
        {profile.avatar_url && (
          <Button variant="ghost" className="h-11 px-4 text-[14px]" onClick={remove} disabled={update.isPending}>
            <Trash2 className="size-4" />
            Remove photo
          </Button>
        )}
      </div>
      {(error ?? flow.error) && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-owe-ink">
          {error ?? flow.error}
        </p>
      )}
      {flow.element}
    </div>
  );
}

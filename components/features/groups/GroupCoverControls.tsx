"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { usePhotoFlow } from "@/components/features/photos/PhotoFlow";
import { Button } from "@/components/ui";
import { friendlyError } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups-data";
import { removeStoredPhoto } from "@/lib/photo-storage";
import { pastelVar } from "@/lib/pastels";
import { useSetGroupCover } from "@/lib/queries/groups";
import { cn } from "@/lib/cn";
import { SCRIM_RAMP_CARD } from "@/lib/images";
import { CoverBackdrop, CoverScrim } from "./CoverBackdrop";

/** Group settings (admins): background photo. Add / Change / Remove, with a live preview. */
export function GroupCoverControls({ group }: { group: GroupWithMembers }) {
  const setCover = useSetGroupCover(group.id);
  const [error, setError] = useState<string | null>(null);
  const flow = usePhotoFlow({
    kind: "cover",
    folder: group.id,
    onUploaded: async (url) => {
      const old = group.cover_url;
      try {
        await setCover.mutateAsync(url);
      } catch (e) {
        void removeStoredPhoto("group-covers", url); // don't leave the new file orphaned
        throw new Error(friendlyError(e));
      }
      if (old && old !== url) void removeStoredPhoto("group-covers", old);
    },
  });

  const remove = async () => {
    setError(null);
    const old = group.cover_url;
    try {
      await setCover.mutateAsync(null);
      void removeStoredPhoto("group-covers", old);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <div>
      <p className="micro mb-2 text-ink-faded">Background</p>
      <div
        className={cn(
          "relative isolate flex aspect-[2/1] w-full items-end overflow-hidden rounded-2xl border-[1.5px] border-on-pastel/[0.08] p-4",
          group.cover_url ? "text-white" : "text-on-pastel",
        )}
        style={{ backgroundColor: pastelVar(group.color) }}
      >
        <CoverBackdrop url={group.cover_url} />
        <span className="relative font-display text-[32px] uppercase leading-[0.9]">
          {group.cover_url && <CoverScrim rampPx={SCRIM_RAMP_CARD} className="-inset-x-4 -bottom-4" />}
          {group.emoji} {group.name}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="h-11 px-4 text-[14px]" onClick={flow.pick}>
          <ImagePlus className="size-4" />
          {group.cover_url ? "Change background" : "Add background"}
        </Button>
        {group.cover_url && (
          <Button type="button" variant="ghost" className="h-11 px-4 text-[14px]" onClick={remove} disabled={setCover.isPending}>
            <Trash2 className="size-4" />
            Remove
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

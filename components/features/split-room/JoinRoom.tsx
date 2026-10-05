"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { friendlyError } from "@/lib/groups";
import { pastelVar } from "@/lib/pastels";
import { useJoinRoom } from "@/lib/queries/rooms";
import type { RoomPreview } from "@/lib/supabase/types";

/** Opened a room link (or scanned its QR) without being in the group yet. */
export function JoinRoom({ code, preview }: { code: string; preview: RoomPreview }) {
  const router = useRouter();
  const join = useJoinRoom();
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col justify-center px-5 py-10">
      <section
        className="rounded-card border-[1.5px] border-on-pastel/[0.08] p-6 text-on-pastel"
        style={{ backgroundColor: pastelVar(preview.color) }}
        aria-labelledby="join-room-title"
      >
        <p className="micro opacity-75">Split Room · {code}</p>
        <h1 id="join-room-title" className="mt-3 break-words font-display text-[52px] uppercase leading-[0.9]">
          {preview.room_name}
        </h1>
        <p className="mt-3 text-[15px] font-semibold opacity-75">
          {preview.host_name ? `${preview.host_name.split(" ")[0]} is splitting the bill` : "A bill is being split"} live in
        </p>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface p-3 text-ink">
          <span className="text-[36px] leading-none" aria-hidden>
            {preview.emoji}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[17px] font-semibold">{preview.group_name}</span>
            <span className="micro text-ink-faded">
              {preview.member_count} {preview.member_count === 1 ? "member" : "members"}
            </span>
          </span>
        </div>
      </section>

      <p className="mt-5 text-center text-[14px] font-medium text-ink/60">
        Joining adds you to {preview.group_name}, so the bill lands in the group&apos;s balances.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-center text-[14px] font-medium text-owe-ink">
          {error}
        </p>
      )}
      <Button
        fullWidth
        className="mt-5"
        disabled={join.isPending}
        onClick={() => {
          setError(null);
          join.mutate(code, {
            onSuccess: () => router.refresh(),
            onError: (e) => setError(friendlyError(e)),
          });
        }}
      >
        {join.isPending ? "Joining…" : "Join group & room"}
      </Button>
    </main>
  );
}

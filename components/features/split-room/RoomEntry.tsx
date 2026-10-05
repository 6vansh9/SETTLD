"use client";

import { ArrowRight, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { friendlyError } from "@/lib/groups";
import { useCreateRoom, useOpenRooms } from "@/lib/queries/rooms";

/** "Split Room open · Join" on the group screen while a room is live. */
export function RoomBanner({ groupId }: { groupId: string }) {
  const { data: rooms = [] } = useOpenRooms(groupId);
  const live = rooms.filter((r) => Date.parse(r.expires_at) > Date.now());
  if (live.length === 0) return null;
  return (
    <div className="mx-5 mt-4 space-y-2">
      {live.slice(0, 2).map((r) => (
        <Link
          key={r.id}
          href={`/room/${r.code}`}
          className="flex items-center gap-3 rounded-2xl bg-coral px-4 py-3 text-on-pastel"
        >
          <span className="relative flex size-2.5" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-on-pastel opacity-40 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-on-pastel" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            Split Room open · {r.name}
          </span>
          <span className="flex items-center gap-1 font-display-alt text-[18px] uppercase">
            Join
            <ArrowRight className="size-4" strokeWidth={2.5} />
          </span>
        </Link>
      ))}
    </div>
  );
}

/** "New Split Room": name it, then land in the room with the item editor open. */
export function NewRoomButton({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-5 mt-4 flex w-[calc(100%-40px)] items-center gap-3 rounded-2xl border-[1.5px] border-ink/[0.08] bg-surface px-4 py-3 text-left"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-butter text-on-pastel">
          <ReceiptText className="size-5" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">New Split Room</span>
          <span className="block text-[13px] font-medium text-ink/60">Everyone taps what they had, live</span>
        </span>
        <ArrowRight className="size-4 text-ink/40" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New Split Room">
        <NewRoomForm groupId={groupId} />
      </Sheet>
    </>
  );
}

function NewRoomForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const create = useCreateRoom();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        create.mutate(
          { groupId, name: name.trim() || "Split Room" },
          { onSuccess: (r) => router.push(`/room/${r.code}`), onError: (err) => setError(friendlyError(err)) },
        );
      }}
    >
      <label htmlFor="new-room-name" className="micro text-ink-faded">
        What&apos;s the bill?
      </label>
      <input
        id="new-room-name"
        autoFocus
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        placeholder="Friday dinner"
        className="mt-1 h-12 w-full rounded-2xl border-[1.5px] border-ink/15 bg-surface px-4 text-[16px] font-medium outline-none focus:border-ink"
      />
      <p className="mt-3 text-[13px] font-medium text-ink/60">
        You&apos;ll add the items next. The room gets a code and a QR, and closes after 12 hours.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-owe-ink">
          {error}
        </p>
      )}
      <Button type="submit" fullWidth className="mt-5" disabled={create.isPending || create.isSuccess}>
        {create.isPending || create.isSuccess ? "Opening…" : "Open the room"}
      </Button>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { Button, Sheet, Switch } from "@/components/ui";
import { friendlyError, validateName } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups-data";
import type { Pastel } from "@/lib/pastels";
import { useSetSimplify } from "@/lib/queries/expenses";
import { useSetArchived, useUpdateGroup } from "@/lib/queries/groups";
import { EmojiPicker, GroupNameField, GroupPreview, PastelPicker } from "./GroupFields";

/** Admin: rename, emoji, color, archive / unarchive. */
export function GroupSettingsSheet({
  open,
  onClose,
  group,
}: {
  open: boolean;
  onClose: () => void;
  group: GroupWithMembers;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Group settings">
      <SettingsBody group={group} onDone={onClose} />
    </Sheet>
  );
}

function SettingsBody({ group, onDone }: { group: GroupWithMembers; onDone: () => void }) {
  const router = useRouter();
  const update = useUpdateGroup(group.id);
  const archive = useSetArchived(group.id);
  const simplify = useSetSimplify(group.id);
  const [simplifyOn, setSimplifyOn] = useState(group.simplify);
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [color, setColor] = useState<Pastel>(group.color);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const archived = !!group.archived_at;
  const nameError = validateName(name);
  const dirty = name.trim() !== group.name || emoji !== group.emoji || color !== group.color;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameError) return;
    setError(null);
    try {
      await update.mutateAsync({ name, emoji, color });
      onDone();
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const toggleArchive = async () => {
    setError(null);
    try {
      await archive.mutateAsync(!archived);
      onDone();
      if (!archived) router.push("/groups");
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className="space-y-6">
      {archived ? (
        <p className="text-[15px] font-medium text-ink/70">
          This group is archived and read-only. Unarchive it to make changes or invite people.
        </p>
      ) : (
        <form onSubmit={save} noValidate className="space-y-6">
          <GroupPreview name={name} emoji={emoji} color={color} />
          <GroupNameField value={name} onChange={setName} error={name ? nameError : null} />
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <PastelPicker value={color} onChange={setColor} />
          <Button type="submit" fullWidth disabled={!dirty || !!nameError || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      )}

      {!archived && (
        <div className="flex items-center justify-between gap-4 border-t-[1.5px] border-ink/[0.06] pt-5">
          <span>
            <span className="block text-[15px] font-semibold">Simplify debts</span>
            <span className="mt-0.5 block text-[13px] font-medium text-ink/50">
              Fewest payments to settle everyone. Off shows every debt as it happened.
            </span>
          </span>
          <Switch
            label="Simplify debts"
            checked={simplifyOn}
            disabled={simplify.isPending}
            onChange={async (next) => {
              setSimplifyOn(next);
              setError(null);
              try {
                await simplify.mutateAsync(next);
              } catch (err) {
                setSimplifyOn(!next);
                setError(friendlyError(err));
              }
            }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-center text-[14px] font-medium text-owe-ink">
          {error}
        </p>
      )}

      <div className="border-t-[1.5px] border-ink/[0.06] pt-5">
        {confirmArchive && !archived ? (
          <div className="space-y-3">
            <p className="text-[14px] font-medium text-ink/70">
              Archived groups become read-only and move to the bottom of your home screen. You can unarchive any time.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmArchive(false)}>
                Cancel
              </Button>
              <Button variant="secondary" className="flex-1" onClick={toggleArchive} disabled={archive.isPending}>
                {archive.isPending ? "Archiving…" : "Archive"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant={archived ? "primary" : "ghost"}
            fullWidth
            onClick={archived ? toggleArchive : () => setConfirmArchive(true)}
            disabled={archive.isPending}
          >
            {archived ? <ArchiveRestore className="size-5" /> : <Archive className="size-5" />}
            {archived ? (archive.isPending ? "Unarchiving…" : "Unarchive group") : "Archive group"}
          </Button>
        )}
      </div>
    </div>
  );
}

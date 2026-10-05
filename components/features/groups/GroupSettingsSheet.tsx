"use client";

import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { Button, Sheet, Switch } from "@/components/ui";
import { GroupCoverControls } from "./GroupCoverControls";
import { friendlyError, validateName } from "@/lib/groups";
import type { GroupWithMembers, MemberWithProfile } from "@/lib/groups-data";
import { cn } from "@/lib/cn";
import { useSetNotifyLevel, useSetNudgeMode } from "@/lib/queries/social";
import type { NotifyLevel, NudgeMode } from "@/lib/supabase/types";
import type { Pastel } from "@/lib/pastels";
import { useSetSimplify } from "@/lib/queries/expenses";
import { useSetArchived, useUpdateGroup } from "@/lib/queries/groups";
import { EmojiPicker, GroupNameField, GroupPreview, PastelPicker } from "./GroupFields";

/** Everyone: my notifications for this group. Admins also: background, rename, emoji, color, nudges, simplify, archive. */
export function GroupSettingsSheet({
  open,
  onClose,
  group,
  myMember,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  group: GroupWithMembers;
  myMember: MemberWithProfile;
  isAdmin: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Group settings">
      {/* Everyone: my notifications for this group. Admins: the group's own settings. */}
      <NotifySetting group={group} myMember={myMember} />
      {isAdmin && (
        <div className="mt-6 border-t-[1.5px] border-ink/[0.06] pt-6">
          <SettingsBody group={group} onDone={onClose} />
        </div>
      )}
    </Sheet>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-3 grid rounded-full bg-ink/5 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn("h-10 rounded-full px-2 text-[13px] font-semibold", value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink/55")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const NOTIFY_HINT: Record<NotifyLevel, string> = {
  all: "Expenses, payments, comments and nudges.",
  money: "Only expenses you're in, payments and nudges. No comments.",
  off: "Nothing from this group.",
};

function NotifySetting({ group, myMember }: { group: GroupWithMembers; myMember: MemberWithProfile }) {
  const set = useSetNotifyLevel(group.id);
  const [level, setLevel] = useState<NotifyLevel>(myMember.notify_level ?? "all");
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <p className="text-[15px] font-semibold">Notifications from this group</p>
      <Segmented
        label="Notifications from this group"
        value={level}
        options={[
          { value: "all", label: "All" },
          { value: "money", label: "Only money stuff" },
          { value: "off", label: "Off" },
        ]}
        onChange={(v) => {
          const prev = level;
          setLevel(v);
          setError(null);
          set.mutate(v, { onError: (e) => (setLevel(prev), setError(friendlyError(e))) });
        }}
      />
      <p className="mt-2 text-[13px] font-medium text-ink/50">{NOTIFY_HINT[level]} Turn notifications on for this phone in your profile.</p>
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-owe-ink">
          {error}
        </p>
      )}
    </div>
  );
}

function NudgeSetting({ group }: { group: GroupWithMembers }) {
  const set = useSetNudgeMode(group.id);
  const [mode, setMode] = useState<NudgeMode>(group.nudge_mode ?? "on");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="border-t-[1.5px] border-ink/[0.06] pt-5">
      <p className="text-[15px] font-semibold">Nudges</p>
      <p className="mt-0.5 text-[13px] font-medium text-ink/50">
        {mode === "on" ? "Polite, then cheeky, then dramatic." : mode === "polite" ? "Always the polite version." : "Nobody can nudge in this group."}
      </p>
      <Segmented
        label="Nudges"
        value={mode}
        options={[
          { value: "on", label: "On" },
          { value: "polite", label: "Polite only" },
          { value: "off", label: "Off" },
        ]}
        onChange={(v) => {
          const prev = mode;
          setMode(v);
          setError(null);
          set.mutate(v, { onError: (e) => (setMode(prev), setError(friendlyError(e))) });
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-owe-ink">
          {error}
        </p>
      )}
    </div>
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
        <>
        <GroupCoverControls group={group} />
        <form onSubmit={save} noValidate className="space-y-6">
          <GroupPreview name={name} emoji={emoji} color={color} />
          <GroupNameField value={name} onChange={setName} error={name ? nameError : null} />
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <PastelPicker value={color} onChange={setColor} />
          <Button type="submit" fullWidth disabled={!dirty || !!nameError || update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>
        </>
      )}

      {!archived && <NudgeSetting group={group} />}

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

"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link2, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { TextField } from "@/components/features/profile/TextField";
import { Avatar, Button, Sheet } from "@/components/ui";
import { claimShareText, friendlyError, inviteUrl, validateName } from "@/lib/groups";
import { activeMembers, memberAvatar, type GroupWithMembers, type MemberWithProfile } from "@/lib/groups-data";
import { fade, spring } from "@/lib/motion";
import { useAddGhost, useGhostClaimLink, useRemoveMember } from "@/lib/queries/groups";
import { shareOrCopy } from "@/lib/share";

export function MembersSheet({
  open,
  onClose,
  group,
  myUserId,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  group: GroupWithMembers;
  myUserId: string;
  isAdmin: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Members · ${activeMembers(group).length}`}>
      <MembersBody group={group} myUserId={myUserId} isAdmin={isAdmin} />
    </Sheet>
  );
}

function MembersBody({ group, myUserId, isAdmin }: { group: GroupWithMembers; myUserId: string; isAdmin: boolean }) {
  const reduce = useReducedMotion();
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const editable = isAdmin && !group.archived_at;

  return (
    <div>
      <ul className="divide-y-[1.5px] divide-ink/[0.06]">
        <AnimatePresence initial={false}>
          {activeMembers(group).map((m) => (
            <motion.li
              key={m.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={reduce ? fade : spring}
            >
              <MemberRow
                member={m}
                group={group}
                isMe={m.user_id === myUserId}
                editable={editable}
                onStatus={setStatus}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {status && (
        <p role="status" className={`mt-3 text-center text-[14px] font-medium ${status.error ? "text-owe" : "text-ink/70"}`}>
          {status.text}
        </p>
      )}

      {editable && <AddGhostForm groupId={group.id} onStatus={setStatus} />}

      {!isAdmin && (
        <p className="mt-6 text-center text-[13px] font-medium text-ink/50">Only admins can add or remove people.</p>
      )}

      {editable && (
        <p className="mt-4 text-center text-[12px] font-medium text-ink/50">
          People can only be removed once their balance is zero. They stay on past expenses.
        </p>
      )}
    </div>
  );
}

function MemberRow({
  member,
  group,
  isMe,
  editable,
  onStatus,
}: {
  member: MemberWithProfile;
  group: GroupWithMembers;
  isMe: boolean;
  editable: boolean;
  onStatus: (s: { text: string; error?: boolean } | null) => void;
}) {
  const remove = useRemoveMember(group.id);
  const claimLink = useGhostClaimLink();
  const [confirming, setConfirming] = useState(false);

  const shareClaim = async () => {
    onStatus(null);
    try {
      const token = await claimLink.mutateAsync(member.id);
      const url = inviteUrl(window.location.origin, token);
      const result = await shareOrCopy({
        title: `Your spot in ${group.name}`,
        text: claimShareText(member.display_name, group.name, url),
        url,
      });
      if (result === "copied") onStatus({ text: `Claim link for ${member.display_name} copied` });
    } catch (err) {
      onStatus({ text: friendlyError(err), error: true });
    }
  };

  const doRemove = async () => {
    onStatus(null);
    try {
      await remove.mutateAsync(member.id);
    } catch (err) {
      setConfirming(false);
      onStatus({ text: friendlyError(err), error: true });
    }
  };

  return (
    <div className="flex min-h-16 items-center gap-3 py-2">
      <Avatar {...memberAvatar(member)} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">
          {member.display_name}
          {isMe && <span className="text-ink/40"> (you)</span>}
        </p>
        <p className="micro mt-1 text-ink-faded">
          {member.role === "admin" ? "Admin" : member.is_ghost ? "Not joined yet" : "Member"}
        </p>
      </div>

      {confirming ? (
        <div className="flex items-center gap-1">
          <Button variant="ghost" className="h-10 px-3 text-[13px]" onClick={() => setConfirming(false)}>
            Keep
          </Button>
          <button
            type="button"
            onClick={doRemove}
            disabled={remove.isPending}
            className="h-10 rounded-full bg-owe px-4 text-[13px] font-semibold text-on-pastel disabled:opacity-50"
          >
            {remove.isPending ? "…" : "Remove"}
          </button>
        </div>
      ) : (
        editable && (
          <div className="flex items-center">
            {member.is_ghost && (
              <IconButton label={`Share claim link for ${member.display_name}`} onClick={shareClaim} busy={claimLink.isPending}>
                <Link2 className="size-[18px]" />
              </IconButton>
            )}
            {!isMe && (
              <IconButton label={`Remove ${member.display_name}`} onClick={() => setConfirming(true)}>
                <UserMinus className="size-[18px]" />
              </IconButton>
            )}
          </div>
        )
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  busy,
  children,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={busy}
      className="flex size-11 items-center justify-center rounded-full text-ink/60 hover:bg-ink/5 hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function AddGhostForm({
  groupId,
  onStatus,
}: {
  groupId: string;
  onStatus: (s: { text: string; error?: boolean } | null) => void;
}) {
  const add = useAddGhost(groupId);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validateName(name, "Name");
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    onStatus(null);
    try {
      await add.mutateAsync(name);
      onStatus({ text: `${name.trim()} added. Share their claim link so they can take the spot.` });
      setName("");
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-6 border-t-[1.5px] border-ink/[0.06] pt-5">
      <TextField
        label="Add someone without an account"
        placeholder="Their name"
        maxLength={40}
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        error={error}
        hint="They can be in expenses now and claim the spot when they join."
      />
      <Button type="submit" variant="secondary" fullWidth className="mt-3" disabled={add.isPending}>
        <UserPlus className="size-5" strokeWidth={2.25} />
        {add.isPending ? "Adding…" : "Add ghost member"}
      </Button>
    </form>
  );
}

"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Contact, Send, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { PhoneField, phoneError, type PhoneValue } from "@/components/features/profile/PhoneField";
import { pickContact, supportsContactPicker } from "@/lib/contacts";
import { bestE164, fromE164, toE164 } from "@/lib/phone";
import { useGhostPhones } from "@/lib/queries/phone";
import { SendInvitePanel } from "./GhostInvite";
import { TextField } from "@/components/features/profile/TextField";
import { Avatar, Button, Sheet } from "@/components/ui";
import { friendlyError, validateName } from "@/lib/groups";
import { activeMembers, memberAvatar, type GroupWithMembers, type MemberWithProfile } from "@/lib/groups-data";
import { fade, spring } from "@/lib/motion";
import { useAddGhost, useRemoveMember } from "@/lib/queries/groups";

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
  const { data: phones } = useGhostPhones(group.id, editable);

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
                phone={phones?.get(m.id) ?? null}
                onStatus={setStatus}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {status && (
        <p role="status" className={`mt-3 text-center text-[14px] font-medium ${status.error ? "text-owe-ink" : "text-ink/70"}`}>
          {status.text}
        </p>
      )}

      {editable && <AddGhostForm group={group} onStatus={setStatus} />}

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
  phone,
  onStatus,
}: {
  member: MemberWithProfile;
  group: GroupWithMembers;
  isMe: boolean;
  editable: boolean;
  phone: string | null;
  onStatus: (s: { text: string; error?: boolean } | null) => void;
}) {
  const remove = useRemoveMember(group.id);
  const [confirming, setConfirming] = useState(false);
  const [inviting, setInviting] = useState(false);

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
    <div>
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
              <>
                <button
                  type="button"
                  onClick={() => setInviting((v) => !v)}
                  aria-expanded={inviting}
                  className="mr-1 flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-ink/15 px-3 text-[13px] font-semibold"
                >
                  <Send className="size-4" />
                  Send invite
                </button>
              </>
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
    {inviting && member.is_ghost && editable && (
      <div className="pb-3">
        <SendInvitePanel group={group} memberId={member.id} name={member.display_name} phone={phone} />
      </div>
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
  group,
  onStatus,
}: {
  group: GroupWithMembers;
  onStatus: (s: { text: string; error?: boolean } | null) => void;
}) {
  const add = useAddGhost(group.id);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState<PhoneValue>(() => fromE164(null));
  const [error, setError] = useState<string | null>(null);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [added, setAdded] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [canPick, setCanPick] = useState(false);
  useEffect(() => setCanPick(supportsContactPicker()), []);

  const fromContacts = async () => {
    try {
      const c = await pickContact();
      if (!c) return;
      if (c.name) setName(c.name.slice(0, 40));
      const e164 = bestE164(c.tels, phone.country);
      if (e164) setPhone(fromE164(e164));
      else if (c.tels[0]) setPhone({ ...phone, national: c.tels[0] });
    } catch {
      // cancelled or not allowed: nothing to do
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validateName(name, "Name");
    if (invalid) {
      setError(invalid);
      return;
    }
    setPhoneTouched(true);
    if (phoneError(phone, false)) return;
    const e164 = phone.national.trim() ? toE164(phone.national, phone.country) : null;
    setError(null);
    onStatus(null);
    try {
      const id = await add.mutateAsync({ name, phone: e164 });
      setAdded({ id, name: name.trim(), phone: e164 });
      setName("");
      setPhone(fromE164(null));
      setPhoneTouched(false);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <div className="mt-6 border-t-[1.5px] border-ink/[0.06] pt-5">
      {added && (
        <div className="mb-5">
          <SendInvitePanel
            group={group}
            memberId={added.id}
            name={added.name}
            phone={added.phone}
            onAddedPhone={(p) => setAdded({ ...added, phone: p })}
          />
          <button type="button" onClick={() => setAdded(null)} className="mt-2 h-10 w-full text-[13px] font-semibold text-ink/50">
            Done
          </button>
        </div>
      )}
      <form onSubmit={submit} noValidate>
        <p className="text-[15px] font-semibold">Add someone</p>
        <p className="mt-0.5 text-[13px] font-medium text-ink/50">They can be in expenses now and take the spot when they join.</p>
        {canPick && (
          <Button type="button" variant="secondary" fullWidth className="mt-3 h-11" onClick={fromContacts}>
            <Contact className="size-4" />
            Pick from contacts
          </Button>
        )}
        <TextField
          label="Name"
          placeholder="Their name"
          maxLength={40}
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={error}
          className="mt-3"
        />
        <PhoneField
          className="mt-3"
          label="Phone (optional)"
          value={phone}
          onChange={setPhone}
          error={phoneTouched ? phoneError(phone, false) : null}
          hint="Only admins see it. Used to send the invite; it doesn't let anyone in by itself."
        />
        <Button type="submit" variant="secondary" fullWidth className="mt-3" disabled={add.isPending}>
          <UserPlus className="size-5" strokeWidth={2.25} />
          {add.isPending ? "Adding…" : "Add"}
        </Button>
      </form>
    </div>
  );
}

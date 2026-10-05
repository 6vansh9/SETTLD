"use client";

import { CommentThread, ReactionsRow, useMarkOpenSeen } from "@/components/features/social/GroupSocial";
import { ArrowRight, Lock, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { AmountOverlay } from "@/components/features/expense/AmountOverlay";
import { Amount, Avatar, Button, Sheet } from "@/components/ui";
import { friendlyError, microDate } from "@/lib/groups";
import { memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import { useConfirmSettlement, useDisputeSettlement, useUpdateSettlement } from "@/lib/queries/settlements";
import type { Settlement } from "@/lib/supabase/types";
import { METHOD_LABEL, settlementPermissions } from "./SettlementCard";

const STATUS_COPY: Record<Settlement["status"], string> = {
  pending: "Counts toward balances now. Waiting for the receiver to confirm.",
  confirmed: "Confirmed by the receiver.",
  disputed: "The receiver says they didn't get this, so it doesn't count. Edit or delete it.",
};

/** Payment detail: receiver confirms/disputes; whoever recorded it can edit the amount or delete it. */
export function SettlementSheet({
  settlement,
  onClose,
  group,
  myUserId,
  onDelete,
}: {
  settlement: Settlement | null;
  onClose: () => void;
  group: GroupWithMembers;
  myUserId: string;
  onDelete: (s: Settlement) => void;
}) {
  const [amountOpen, setAmountOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const myMemberId = group.members.find((m) => m.user_id === myUserId && !m.left_at)?.id ?? "";
  const update = useUpdateSettlement(group.id, myMemberId);
  const confirm = useConfirmSettlement(group.id);
  const dispute = useDisputeSettlement(group.id);
  const busy = update.isPending || confirm.isPending || dispute.isPending;

  const run = async (p: Promise<unknown>) => {
    setError(null);
    try {
      await p;
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const s = settlement;
  const byId = new Map(group.members.map((m) => [m.id, m]));
  const name = (id: string) => {
    const m = byId.get(id);
    return !m ? "Someone" : m.user_id === myUserId ? "You" : m.display_name;
  };
  const perms = s ? settlementPermissions(s, group, myUserId) : null;

  return (
    <>
      <Sheet open={!!s && !amountOpen} onClose={onClose} title="Payment">
        {s && perms && (
          <div>
            <div className="flex items-center gap-2">
              {byId.get(s.from_member) && <Avatar {...memberAvatar(byId.get(s.from_member)!)} size="md" />}
              <ArrowRight className="size-4 text-ink/60" aria-hidden />
              {byId.get(s.to_member) && <Avatar {...memberAvatar(byId.get(s.to_member)!)} size="md" />}
            </div>
            <h2 className="mt-4 font-display-alt text-[36px] uppercase leading-[0.9]">
              {name(s.from_member)} → {name(s.to_member)}
            </h2>
            <Amount amount={s.amount} currency={s.currency} size="hero" className={s.status === "disputed" ? "mt-3 line-through opacity-50" : "mt-3"} />
            <p className="micro mt-2 text-ink-faded">
              {METHOD_LABEL[s.method]} · {microDate(s.created_at)}
            </p>
            <p className="mt-4 rounded-2xl bg-ink/5 px-4 py-3 text-[14px] font-medium text-ink/70">{STATUS_COPY[s.status]}</p>

            {perms.locked && (
              <p className="mt-3 flex items-start gap-2 text-[13px] font-medium text-ink/60">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {group.archived_at ? "This group is archived." : "Someone in this payment has left the group, so it's locked."}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-center text-[14px] font-medium text-owe-ink">
                {error}
              </p>
            )}

            {(perms.canConfirm || perms.canDispute) && (
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={busy || !perms.canDispute} onClick={() => run(dispute.mutateAsync({ settlement: s }))}>
                  Didn&apos;t get it
                </Button>
                <Button disabled={busy || !perms.canConfirm} onClick={() => run(confirm.mutateAsync({ settlement: s }))}>
                  Confirm
                </Button>
              </div>
            )}

            <ReactionsRow type="settlement" id={s.id} />

            {perms.canEdit && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => onDelete(s)} disabled={busy}>
                  <Trash2 className="size-4" strokeWidth={2.25} />
                  Delete
                </Button>
                <Button variant="secondary" onClick={() => setAmountOpen(true)} disabled={busy}>
                  <Pencil className="size-4" strokeWidth={2.25} />
                  Edit amount
                </Button>
              </div>
            )}

            <CommentThread type="settlement" id={s.id} />
            <SeenMarker id={s.id} />
          </div>
        )}
      </Sheet>
      {s && (
        <AmountOverlay
          open={amountOpen}
          currency={s.currency}
          initialMinor={s.amount}
          label="Amount paid"
          onClose={() => setAmountOpen(false)}
          onDone={(amount) => {
            setAmountOpen(false);
            run(update.mutateAsync({ settlement: s, amount, method: s.method }));
          }}
        />
      )}
    </>
  );
}

/** Clears the settlement's "new" dot while its sheet is open. */
function SeenMarker({ id }: { id: string }) {
  useMarkOpenSeen("settlement", id.startsWith("temp-") ? null : id);
  return null;
}

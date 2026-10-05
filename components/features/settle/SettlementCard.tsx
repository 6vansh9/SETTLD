"use client";

import { NewDot } from "@/components/features/social/GroupSocial";
import { SyncBadge } from "@/components/features/offline/SyncBadge";
import type { WithSync } from "@/lib/offline/overlay";
import { ArrowRight } from "lucide-react";
import { Amount, Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import type { Settlement } from "@/lib/supabase/types";

export const METHOD_LABEL = { upi: "UPI", cash: "Cash", other: "Other" } as const;

/** Who may do what with a payment (mirrors settlement_for_change in 0005_settlements_fx.sql). */
export function settlementPermissions(s: Settlement, group: GroupWithMembers, myUserId: string) {
  const byId = new Map(group.members.map((m) => [m.id, m]));
  const me = group.members.find((m) => m.user_id === myUserId && !m.left_at);
  const locked = [s.from_member, s.to_member].some((id) => byId.get(id)?.left_at) || !!group.archived_at;
  const isReceiver = !!me && s.to_member === me.id;
  const isCreator = s.created_by === myUserId;
  return {
    locked,
    isCreator,
    canConfirm: !locked && isReceiver && s.status !== "confirmed",
    canDispute: !locked && isReceiver && !isCreator && s.status !== "disputed",
    canEdit: !locked && isCreator,
  };
}

/** A payment in the Expenses timeline: payer → receiver, method, status, and Confirm/Dispute for the receiver. */
export function SettlementCard({
  settlement: s,
  group,
  myUserId,
  onOpen,
  onConfirm,
  onDispute,
  busy,
}: {
  settlement: Settlement;
  group: GroupWithMembers;
  myUserId: string;
  onOpen: () => void;
  onConfirm: () => void;
  onDispute: () => void;
  busy: boolean;
}) {
  const byId = new Map(group.members.map((m) => [m.id, m]));
  const from = byId.get(s.from_member);
  const to = byId.get(s.to_member);
  const name = (m?: (typeof group.members)[number]) => (!m ? "Someone" : m.user_id === myUserId ? "You" : m.display_name.split(" ")[0]);
  const perms = settlementPermissions(s, group, myUserId);
  const disputed = s.status === "disputed";
  const showActions = (perms.canConfirm && s.status === "pending") || (perms.canDispute && s.status === "pending");

  return (
    <div
      className={cn(
        "rounded-[20px] border-[1.5px] border-dashed bg-surface",
        disputed ? "border-owe/50" : "border-ink/20",
      )}
    >
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 p-3 text-left">
        <span className="flex shrink-0 items-center gap-1">
          {from && <Avatar {...memberAvatar(from)} size="sm" />}
          <ArrowRight className="size-3.5 text-ink/60" aria-hidden />
          {to && <Avatar {...memberAvatar(to)} size="sm" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="block truncate text-[15px] font-semibold">
              {name(from)} paid {name(to)}
            </span>
            <NewDot type="settlement" id={s.id} />
            <SyncBadge state={(s as WithSync<Settlement>).sync} />
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <Chip>{METHOD_LABEL[s.method]}</Chip>
            <Chip tone={s.status}>{s.status === "pending" ? "Awaiting confirmation" : s.status === "confirmed" ? "Confirmed" : "Disputed · not counted"}</Chip>
          </span>
        </span>
        <Amount
          amount={s.amount}
          currency={s.currency}
          size="sm"
          className={cn("text-[24px]", disputed && "line-through opacity-50")}
        />
      </button>
      {showActions && (
        <div className="grid grid-cols-2 gap-2 border-t-[1.5px] border-dashed border-ink/10 p-2">
          <button
            type="button"
            onClick={onDispute}
            disabled={busy || !perms.canDispute}
            className="h-10 rounded-full text-[13px] font-semibold text-ink/70 hover:bg-ink/5 disabled:opacity-40"
          >
            Didn&apos;t get it
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !perms.canConfirm}
            className="h-10 rounded-full bg-ink text-[13px] font-semibold text-bg disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: Settlement["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "confirmed" ? "bg-owed/15 text-ink" : tone === "disputed" ? "bg-owe/15 text-ink" : "bg-ink/[0.07] text-ink/70",
      )}
    >
      {children}
    </span>
  );
}

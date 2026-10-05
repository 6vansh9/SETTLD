"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Amount, Avatar } from "@/components/ui";
import { memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import { spring } from "@/lib/motion";
import { pastelVar } from "@/lib/pastels";
import type { RoomData } from "@/lib/split-room-data";
import type { RoomBill } from "@/lib/splitRoom";

type Kind = "finalized" | "cancelled" | "expired" | "closed" | "not-member" | "missing";

const COPY: Record<Exclude<Kind, "finalized">, { big: [string, string]; text: string }> = {
  expired: { big: ["Room", "expired"], text: "Split Rooms close 12 hours after they open. Nothing was added to the group. The host can open a new one." },
  cancelled: { big: ["Room", "closed"], text: "The host closed this room without adding an expense." },
  closed: { big: ["Room", "closed"], text: "This bill has already been split. Ask someone in the group for a fresh link." },
  "not-member": { big: ["Not in", "group"], text: "You're no longer in this group, so this room isn't available." },
  missing: { big: ["No such", "room"], text: "Check the code, or ask whoever's at the table for the link." },
};

/** Clear end states (never an error screen). Finalized shows the summary card on every phone. */
export function RoomEnd({
  kind,
  groupId,
  data,
  group,
  bill,
  myMemberId,
}: {
  kind: Kind;
  groupId?: string;
  data?: RoomData;
  group?: GroupWithMembers;
  bill?: RoomBill;
  myMemberId?: string;
}) {
  const back = groupId ? `/g/${groupId}` : "/groups";
  if (kind === "finalized" && data && group && bill) return <Summary data={data} group={group} bill={bill} myMemberId={myMemberId} />;
  const c = COPY[kind === "finalized" ? "expired" : kind];
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col items-center justify-center px-5 text-center">
      <p aria-hidden className="font-display text-[96px] uppercase leading-[0.85] text-ink-faded">
        {c.big[0]}
        <br />
        {c.big[1]}
      </p>
      <h1 className="sr-only">{c.big.join(" ")}</h1>
      <p className="mt-6 max-w-[300px] text-[15px] font-medium text-ink/60">{c.text}</p>
      <Link
        href={back}
        className="mt-6 inline-flex h-14 items-center rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
      >
        {groupId ? "Back to the group" : "Go to Settld"}
      </Link>
    </main>
  );
}

function Summary({ data, group, bill, myMemberId }: { data: RoomData; group: GroupWithMembers; bill: RoomBill; myMemberId?: string }) {
  const reduce = useReducedMotion();
  const byId = new Map(group.members.map((m) => [m.id, m]));
  const payer = data.room.paid_by ? byId.get(data.room.paid_by) : null;
  const mine = bill.people.find((p) => p.memberId === myMemberId);
  const name = (id: string) => (id === myMemberId ? "You" : (byId.get(id)?.display_name.split(" ")[0] ?? "Someone"));
  const owes = mine && payer && payer.id !== myMemberId;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-app px-5 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))]">
      <motion.section
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={reduce ? { duration: 0.2 } : spring}
        className="relative overflow-hidden rounded-card border-[1.5px] border-on-pastel/[0.08] p-6 text-on-pastel"
        style={{ backgroundColor: pastelVar(group.color) }}
        aria-labelledby="summary-title"
      >
        <span
          aria-hidden
          className="absolute right-4 top-5 rotate-[-12deg] rounded-xl border-[3px] border-on-pastel px-3 py-1 font-display text-[22px] uppercase leading-none"
        >
          Settld ✓
        </span>
        <p className="micro opacity-60">
          {group.emoji} {group.name} · Split Room
        </p>
        <h1 id="summary-title" className="mt-3 max-w-[75%] break-words font-display text-[44px] uppercase leading-[0.9]">
          {data.room.name}
        </h1>
        <p className="micro mt-5 opacity-60">Bill total</p>
        <Amount amount={bill.total} currency={group.base_currency} size="hero" className="mt-1" />
        {payer && <p className="mt-2 text-[14px] font-semibold opacity-70">Paid by {name(payer.id)}</p>}

        <ul className="mt-5 divide-y divide-on-pastel/10 rounded-2xl bg-surface px-4 text-ink">
          {bill.people.map((p) => {
            const m = byId.get(p.memberId);
            return (
              <li key={p.memberId} className="flex items-center gap-3 py-3">
                {m && <Avatar {...memberAvatar(m)} size="sm" />}
                <span className="flex-1 text-[15px] font-semibold">{name(p.memberId)}</span>
                <Amount amount={p.total} currency={group.base_currency} size="sm" />
              </li>
            );
          })}
        </ul>
      </motion.section>

      {mine && (
        <p className="mt-5 text-center text-[15px] font-medium text-ink/70">
          {owes ? (
            <>
              You owe {name(payer.id)} <Amount amount={mine.total} currency={group.base_currency} size="sm" sign="owe" />
            </>
          ) : payer?.id === myMemberId ? (
            "You paid. Everyone's share is now on the group."
          ) : (
            <>
              Your share: <Amount amount={mine.total} currency={group.base_currency} size="sm" />
            </>
          )}
        </p>
      )}

      <div className="mt-6 grid gap-2">
        {data.room.expense_id && (
          <Link
            href={`/g/${group.id}?open=${encodeURIComponent(`expense:${data.room.expense_id}`)}`}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
          >
            Open the expense
            <ArrowRight className="size-5" strokeWidth={2.5} />
          </Link>
        )}
        <Link href={`/g/${group.id}`} className="inline-flex h-12 items-center justify-center rounded-full text-[15px] font-semibold hover:bg-ink/5">
          Back to {group.name}
        </Link>
      </div>
    </main>
  );
}

"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Amount, Avatar, Button, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/groups";
import { memberAvatar, type GroupWithMembers, type MemberWithProfile } from "@/lib/groups-data";
import type { CurrencyCode } from "@/lib/money";
import { useFinalizeRoom } from "@/lib/queries/rooms";
import { claimantsOf, sharesOf, type RoomData } from "@/lib/split-room-data";
import { allocate, itemCost, type PersonTotal, type RoomBill } from "@/lib/splitRoom";
import type { SplitRoomItem } from "@/lib/supabase/types";
import { uuid } from "@/lib/uuid";

const first = (n: string) => n.split(" ")[0];

/**
 * Long-press: custom shares for one item. Everyone can change their own; the host can change
 * anyone's, including ghosts (that's how the host assigns items to people without phones).
 */
export function SharesSheet({
  open,
  onClose,
  item,
  d,
  members,
  meId,
  isHost,
  currency,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  item: SplitRoomItem | null;
  d: RoomData;
  members: MemberWithProfile[];
  meId: string;
  isHost: boolean;
  currency: CurrencyCode;
  onChange: (memberId: string, shares: number) => void;
}) {
  if (!item) return <Sheet open={false} onClose={onClose} title="Shares">{null}</Sheet>;
  const who = claimantsOf(d, item.id);
  const parts = who.length ? allocate(itemCost(item), who.map((c) => c.shares)) : [];
  const amountOf = new Map(who.map((c, k) => [c.member_id, parts[k]]));
  // Host sees everyone (to assign ghosts); others see who's on it plus themselves.
  const rows = isHost ? members : members.filter((m) => m.id === meId || amountOf.has(m.id));
  const total = who.reduce((a, c) => a + c.shares, 0);

  return (
    <Sheet open={open} onClose={onClose} title={`${item.name} · shares`}>
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-semibold">{item.qty > 1 ? `${item.qty} × ${item.name}` : item.name}</p>
        <Amount amount={itemCost(item)} currency={currency} size="md" />
      </div>
      <p className="mt-1 text-[13px] font-medium text-ink/60">
        {isHost ? "Set how many shares each person takes. Add people without phones here too." : "Had more than one share? Set yours. Shares split the price."}
      </p>
      <ul className="mt-4 space-y-2">
        {rows.map((m) => {
          const s = sharesOf(d, item.id, m.id);
          const editable = isHost || m.id === meId;
          return (
            <li key={m.id} className={cn("flex items-center gap-3 rounded-2xl border-[1.5px] p-3", s > 0 ? "border-ink/20" : "border-ink/[0.06]")}>
              <Avatar {...memberAvatar(m)} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">
                  {m.id === meId ? "You" : m.display_name}
                  {m.is_ghost && <span className="ml-1 text-[12px] font-medium text-ink/60">(no phone)</span>}
                </span>
                <span className="text-[12px] font-medium text-ink/60">
                  {s > 0 ? (
                    <>
                      {s}/{total} · <Amount amount={amountOf.get(m.id) ?? 0} currency={currency} size="sm" />
                    </>
                  ) : (
                    "Not on this item"
                  )}
                </span>
              </span>
              {editable ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Fewer shares for ${m.display_name}`}
                    disabled={s === 0}
                    onClick={() => onChange(m.id, s - 1)}
                    className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-ink/15 disabled:opacity-30"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-7 text-center font-num text-[24px] leading-none" aria-label={`${s} shares`}>
                    {s}
                  </span>
                  <button
                    type="button"
                    aria-label={`More shares for ${m.display_name}`}
                    disabled={s >= 99}
                    onClick={() => onChange(m.id, s + 1)}
                    className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-ink/15 disabled:opacity-30"
                  >
                    <Plus className="size-4" />
                  </button>
                </span>
              ) : (
                <span className="font-num text-[24px] leading-none text-ink/60">{s}</span>
              )}
            </li>
          );
        })}
      </ul>
      <Button fullWidth className="mt-5" onClick={onClose}>
        Done
      </Button>
    </Sheet>
  );
}

/** My items, my slice of tax/service/tip, and everyone's totals. */
export function BreakdownSheet({
  open,
  onClose,
  bill,
  mine,
  d,
  currency,
  nameOf,
}: {
  open: boolean;
  onClose: () => void;
  bill: RoomBill;
  mine: PersonTotal | undefined;
  d: RoomData;
  currency: CurrencyCode;
  nameOf: (memberId: string) => string;
}) {
  const itemName = new Map(d.items.map((i) => [i.id, i]));
  const row = (label: React.ReactNode, amount: number, strong = false) => (
    <li className={cn("flex items-baseline justify-between gap-3 py-2", strong && "border-t-[1.5px] border-ink/10 pt-3")}>
      <span className={cn("min-w-0 truncate text-[15px]", strong ? "font-semibold" : "font-medium text-ink/80")}>{label}</span>
      <Amount amount={amount} currency={currency} size={strong ? "lg" : "sm"} />
    </li>
  );
  return (
    <Sheet open={open} onClose={onClose} title="My breakdown">
      {!mine ? (
        <p className="py-6 text-center text-[15px] font-medium text-ink/60">Tap the items you had and they&apos;ll add up here.</p>
      ) : (
        <ul>
          {mine.lines.map((l) => {
            const it = itemName.get(l.itemId);
            const s = it ? sharesOf(d, it.id, mine.memberId) : 0;
            const total = it ? claimantsOf(d, it.id).reduce((a, c) => a + c.shares, 0) : 0;
            return row(
              <>
                {it?.name ?? "Item"}
                {total > 1 && <span className="ml-1 text-[12px] text-ink/60">({s}/{total})</span>}
              </>,
              l.amount,
            );
          })}
          {row("Items", mine.items, true)}
          {mine.tax > 0 && row("My share of tax", mine.tax)}
          {mine.service > 0 && row("My share of service", mine.service)}
          {mine.tip > 0 && row("My share of tip", mine.tip)}
          {row("My total", mine.total, true)}
        </ul>
      )}
      <p className="micro mt-6 text-ink-faded">Everyone so far</p>
      <ul className="mt-1">
        {bill.people.map((p) => (
          <li key={p.memberId} className="flex items-baseline justify-between py-1.5 text-[14px] font-medium">
            <span>{p.memberId === mine?.memberId ? "You" : nameOf(p.memberId)}</span>
            <Amount amount={p.total} currency={currency} size="sm" />
          </li>
        ))}
        {bill.unclaimed.length > 0 && (
          <li className="flex items-baseline justify-between py-1.5 text-[14px] font-medium text-owe-ink">
            <span>Unclaimed</span>
            <span>{bill.unclaimed.length} items</span>
          </li>
        )}
      </ul>
    </Sheet>
  );
}

/** Host: who paid the bill, then finalize into one expense. */
export function FinalizeSheet({
  open,
  onClose,
  code,
  d,
  group,
  bill,
  meId,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  d: RoomData;
  group: GroupWithMembers;
  bill: RoomBill;
  meId: string;
}) {
  const finalize = useFinalizeRoom(code, group.id);
  const [payer, setPayer] = useState(d.room.host_member);
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef(uuid());
  const members = group.members.filter((m) => !m.left_at);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Finalize"
      footer={
        <div>
          {error && (
            <p role="alert" className="mb-2 text-center text-[13px] font-medium text-owe-ink">
              {error}
            </p>
          )}
          <Button
            fullWidth
            disabled={finalize.isPending}
            onClick={() => {
              setError(null);
              finalize.mutate(
                { roomId: d.room.id, payer, clientId: clientId.current },
                { onSuccess: onClose, onError: (e) => setError(friendlyError(e)) },
              );
            }}
          >
            {finalize.isPending ? "Finalizing…" : "Finalize & add expense"}
          </Button>
        </div>
      }
    >
      <p className="micro text-ink-faded">Bill total</p>
      <Amount amount={bill.total} currency={group.base_currency} size="xl" className="mt-1" />
      <p className="mt-2 text-[14px] font-medium text-ink/60">
        One expense, “{d.room.name}”, split exactly between {bill.people.length} {bill.people.length === 1 ? "person" : "people"}.
      </p>
      <p className="micro mt-6 text-ink-faded">Who paid the bill?</p>
      <ul className="mt-2 space-y-2" role="radiogroup" aria-label="Who paid">
        {members.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              role="radio"
              aria-checked={payer === m.id}
              onClick={() => setPayer(m.id)}
              className={cn("flex w-full items-center gap-3 rounded-2xl border-[1.5px] p-3 text-left", payer === m.id ? "border-ink" : "border-ink/[0.08]")}
            >
              <Avatar {...memberAvatar(m)} size="md" />
              <span className="flex-1 text-[15px] font-semibold">{m.id === meId ? "You" : first(m.display_name)}</span>
              {payer === m.id && <Check className="size-5" strokeWidth={2.5} />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

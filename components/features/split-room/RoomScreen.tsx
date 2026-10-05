"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Check, Copy, ListChecks, Pencil, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { QrCode } from "@/components/features/groups/QrCode";
import { Amount, Avatar, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { activeMembers, memberAvatar, myMember, type GroupWithMembers, type MemberWithProfile } from "@/lib/groups-data";
import { pastelVar } from "@/lib/pastels";
import { useGroup } from "@/lib/queries/groups";
import { useQueryClient } from "@tanstack/react-query";
import { latestRoom, useClaim, useRoom } from "@/lib/queries/rooms";
import { useRoomRealtime } from "@/lib/realtime/useRoomRealtime";
import { copyText, shareOrCopy } from "@/lib/share";
import { billInputs, claimantsOf, roomState, roomUrl, sharesOf, type RoomData } from "@/lib/split-room-data";
import { computeBill, finalizeBlocker, itemCost, type RoomBill } from "@/lib/splitRoom";
import type { SplitRoomItem } from "@/lib/supabase/types";
import { HostEditor } from "./HostEditor";
import { BreakdownSheet, FinalizeSheet, SharesSheet } from "./RoomSheets";
import { RoomEnd } from "./RoomEnd";

const LONG_PRESS_MS = 450;

export function RoomScreen({
  code,
  initialRoom,
  initialGroup,
  myUserId,
}: {
  code: string;
  initialRoom: RoomData;
  initialGroup: GroupWithMembers;
  myUserId: string;
}) {
  const { data: roomData } = useRoom(code, initialRoom);
  const { data: group } = useGroup(initialGroup.id, initialGroup);
  const g = group ?? initialGroup;
  const d = roomData ?? initialRoom;
  const me = myMember(g, myUserId);
  const isHost = !!me && d.room.host_member === me.id;
  const claim = useClaim(code);
  const qc = useQueryClient();
  const { here } = useRoomRealtime(code, d.room.id, me?.id ?? null);

  // Expiry flips the screen to its end state even with nobody tapping.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const state = roomState(d.room, now);

  const { items, claims, charges } = billInputs(d);
  const bill = useMemo(() => computeBill(items, claims, charges), [items, claims, charges]);
  const membersById = useMemo(() => new Map(g.members.map((m) => [m.id, m])), [g.members]);
  const mine = me ? bill.people.find((p) => p.memberId === me.id) : undefined;
  const currency = g.base_currency;

  const [editing, setEditing] = useState(false);
  const [sharesFor, setSharesFor] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Host lands here straight after creating the room: open the editor while it's empty.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (isHost && state === "open" && d.items.length === 0) setEditing(true);
  }, [isHost, state, d.items.length]);

  if (!me) return <RoomEnd kind="not-member" groupId={g.id} />;
  if (state !== "open") return <RoomEnd kind={state} groupId={g.id} data={d} group={g} bill={bill} myMemberId={me.id} />;

  // Who's in the room: people here right now, plus anyone who's claimed something.
  const inRoom = [...new Set([...here, ...bill.people.map((p) => p.memberId), d.room.host_member])]
    .map((id) => membersById.get(id))
    .filter((m): m is MemberWithProfile => !!m);
  const host = membersById.get(d.room.host_member);
  const blocker = finalizeBlocker(items, bill);
  const sharesItem = d.items.find((i) => i.id === sharesFor) ?? null;

  const tap = (item: SplitRoomItem) => {
    // From the latest cache, so a quick double-tap flips twice rather than repeating itself.
    const on = sharesOf(latestRoom(qc, code) ?? d, item.id, me.id) === 0;
    claim.mutate({ kind: "toggle", itemId: item.id, memberId: me.id, on });
  };

  return (
    <div className="mx-auto min-h-dvh w-full max-w-app pb-[calc(200px+env(safe-area-inset-bottom))]">
      <header
        className="rounded-b-[32px] border-[1.5px] border-t-0 border-on-pastel/[0.08] px-5 pb-6 pt-[calc(12px+env(safe-area-inset-top))] text-on-pastel"
        style={{ backgroundColor: pastelVar(g.color) }}
      >
        <div className="flex h-11 items-center justify-between">
          <Link href={`/g/${g.id}`} aria-label={`Back to ${g.name}`} className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-on-pastel/5">
            <ArrowLeft className="size-5" strokeWidth={2.25} />
          </Link>
          <span className="micro opacity-75">
            {g.emoji} {g.name}
          </span>
          {isHost ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="-mr-2 flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold hover:bg-on-pastel/5"
            >
              <Pencil className="size-4" strokeWidth={2.25} />
              Items
            </button>
          ) : (
            <span className="w-11" />
          )}
        </div>

        <p className="micro mt-4 opacity-75">Split Room · {hoursLeft(d.room.expires_at, now)}</p>
        <h1 className="mt-2 break-words font-display text-[48px] uppercase leading-[0.9]">{d.room.name}</h1>

        <div className="mt-5">
          <p className="micro opacity-75">Bill total</p>
          <Amount amount={bill.total} currency={currency} size="xl" className="mt-1" />
          <ChargesLine bill={bill} d={d} currency={currency} />
        </div>

        <ShareCard code={code} />

        <div className="mt-5">
          <p className="micro mb-2 opacity-75">In the room · {inRoom.length}</p>
          <div className="flex flex-wrap gap-1.5" style={{ "--ring": pastelVar(g.color) } as React.CSSProperties}>
            {inRoom.map((m) => (
              <span key={m.id} className="relative">
                <Avatar {...memberAvatar(m)} size="md" className="ring-2 ring-[color:var(--ring)]" />
                {here.includes(m.id) && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[color:var(--ring)] bg-owed" aria-label="here now" />
                )}
              </span>
            ))}
          </div>
          {host && <p className="micro mt-2 opacity-75">Host · {host.id === me.id ? "you" : host.display_name}</p>}
        </div>
      </header>

      <section className="mt-6 px-5" aria-label="Items">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display-alt text-[28px] uppercase leading-none">Items</h2>
          <span className="micro text-ink-faded">
            {d.items.length === 0 ? "None yet" : bill.unclaimed.length ? `${bill.unclaimed.length} unclaimed` : "All claimed"}
          </span>
        </div>
        <p className="mt-2 text-[13px] font-medium text-ink/60">Tap what you had. Long-press for custom shares.</p>

        {d.items.length === 0 ? (
          <div className="mt-6 rounded-card border-[1.5px] border-dashed border-ink/15 p-6 text-center">
            <p className="font-display text-[40px] uppercase leading-none text-ink-faded">No items</p>
            <p className="mt-3 text-[14px] font-medium text-ink/60">
              {isHost ? "Add what's on the bill: name, price, quantity." : `Waiting for ${host?.display_name.split(" ")[0] ?? "the host"} to add the bill.`}
            </p>
            {isHost && (
              <Button className="mt-4" onClick={() => setEditing(true)}>
                Add items
              </Button>
            )}
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {d.items.map((item) => (
              <li key={item.id}>
                <ItemCard
                  item={item}
                  d={d}
                  meId={me.id}
                  currency={currency}
                  membersById={membersById}
                  onTap={() => tap(item)}
                  onLongPress={() => setSharesFor(item.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sticky footer: my live total; host finalize */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-app">
        <div className="rounded-t-card border-[1.5px] border-b-0 border-ink/[0.08] bg-surface px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgb(0_0_0/0.06)]">
          <button type="button" onClick={() => setBreakdown(true)} className="flex w-full items-end justify-between gap-3 text-left" aria-label="My total, see breakdown">
            <span>
              <span className="micro block text-ink-faded">My total</span>
              <Amount amount={mine?.total ?? 0} currency={currency} size="xl" className="mt-1" />
            </span>
            <span className="mb-1 flex items-center gap-1 text-[13px] font-semibold text-ink/60">
              <ListChecks className="size-4" />
              Breakdown
            </span>
          </button>
          {isHost && (
            <div className="mt-3">
              <Button fullWidth disabled={!!blocker} onClick={() => setFinalizing(true)}>
                Finalize
              </Button>
              {blocker && (
                <p className="mt-2 text-center text-[13px] font-medium text-ink/60" aria-live="polite">
                  {blocker}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {isHost && <HostEditor open={editing} onClose={() => setEditing(false)} code={code} d={d} currency={currency} />}
      <SharesSheet
        open={!!sharesItem}
        onClose={() => setSharesFor(null)}
        item={sharesItem}
        d={d}
        members={activeMembers(g)}
        meId={me.id}
        isHost={isHost}
        currency={currency}
        onChange={(memberId, shares) => sharesItem && claim.mutate({ kind: "shares", itemId: sharesItem.id, memberId, shares, self: memberId === me.id })}
      />
      <BreakdownSheet
        open={breakdown}
        onClose={() => setBreakdown(false)}
        bill={bill}
        mine={mine}
        d={d}
        currency={currency}
        nameOf={(id) => membersById.get(id)?.display_name.split(" ")[0] ?? "Someone"}
      />
      {isHost && (
        <FinalizeSheet open={finalizing} onClose={() => setFinalizing(false)} code={code} d={d} group={g} bill={bill} meId={me.id} />
      )}
    </div>
  );
}

function hoursLeft(expiresAt: string, now: number) {
  const mins = Math.max(0, Math.round((Date.parse(expiresAt) - now) / 60000));
  if (mins >= 60) return `closes in ${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ""}`.trim();
  return `closes in ${mins} min`;
}

export function pct(bp: number) {
  return `${bp / 100}%`;
}

function ChargesLine({ bill, d, currency }: { bill: RoomBill; d: RoomData; currency: RoomScreenCurrency }) {
  const parts: { label: string; amount: number }[] = [];
  const r = d.room;
  if (bill.tax) parts.push({ label: r.tax_kind === "percent" ? `Tax ${pct(r.tax_value)}` : "Tax", amount: bill.tax });
  if (bill.service) parts.push({ label: r.service_kind === "percent" ? `Service ${pct(r.service_value)}` : "Service", amount: bill.service });
  if (bill.tip) parts.push({ label: r.tip_kind === "percent" ? `Tip ${pct(r.tip_value)}` : "Tip", amount: bill.tip });
  if (parts.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] font-semibold opacity-70">
      <span className="flex items-baseline gap-1">
        Items <Amount amount={bill.subtotal} currency={currency} size="sm" />
      </span>
      {parts.map((p) => (
        <span key={p.label} className="flex items-baseline gap-1">
          + {p.label} <Amount amount={p.amount} currency={currency} size="sm" />
        </span>
      ))}
    </p>
  );
}
type RoomScreenCurrency = GroupWithMembers["base_currency"];

function ShareCard({ code }: { code: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  const url = origin ? roomUrl(origin, code) : "";
  return (
    <div className="mt-5 flex items-center gap-4 rounded-2xl border-[1.5px] border-on-pastel/[0.08] bg-surface p-3 text-ink">
      {url ? <QrCode value={url} label={`QR code to join room ${code}`} className="size-[104px] shrink-0 rounded-xl p-2" /> : <span className="size-[104px] shrink-0 rounded-xl bg-white" />}
      <div className="min-w-0 flex-1">
        <p className="micro text-ink-faded">Room code</p>
        <p className="font-num text-[40px] leading-none tracking-[0.08em]" aria-label={code.split("").join(" ")}>
          {code}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={async () => {
              if (await copyText(url)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }
            }}
            className="flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-ink/15 px-3 text-[13px] font-semibold"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => void shareOrCopy({ title: "Join my Split Room on Settld", text: `Tap what you had: ${url}`, url })}
            aria-label="Share room link"
            className="flex size-9 items-center justify-center rounded-full border-[1.5px] border-ink/15"
          >
            <Share2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  d,
  meId,
  currency,
  membersById,
  onTap,
  onLongPress,
}: {
  item: SplitRoomItem;
  d: RoomData;
  meId: string;
  currency: RoomScreenCurrency;
  membersById: Map<string, MemberWithProfile>;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const reduce = useReducedMotion();
  const who = claimantsOf(d, item.id);
  const mineShares = who.find((c) => c.member_id === meId)?.shares ?? 0;
  const custom = who.some((c) => c.shares > 1);
  const unclaimed = who.length === 0;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const start = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      if ("vibrate" in navigator) navigator.vibrate?.(10);
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <motion.button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (longPressed.current) return;
        onTap();
      }}
      aria-pressed={mineShares > 0}
      aria-label={`${item.name}, ${unclaimed ? "nobody yet" : `${who.length} ${who.length === 1 ? "person" : "people"}`}${mineShares ? ", includes you" : ""}`}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      animate={
        unclaimed && !reduce
          ? { boxShadow: ["0 0 0 0 rgb(var(--coral-rgb) / 0.0)", "0 0 0 6px rgb(var(--coral-rgb) / 0.35)", "0 0 0 0 rgb(var(--coral-rgb) / 0.0)"] }
          : { boxShadow: "0 0 0 0 rgb(var(--coral-rgb) / 0)" }
      }
      transition={unclaimed && !reduce ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      className={cn(
        "flex w-full select-none items-center gap-3 rounded-card border-[1.5px] p-4 text-left [-webkit-touch-callout:none]",
        mineShares > 0 ? "border-ink bg-mint text-on-pastel" : "border-ink/[0.08] bg-surface",
        unclaimed && "border-coral",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-semibold">{item.name}</span>
        {(item.qty > 1 || (!unclaimed && custom)) && (
          <span className={cn("mt-1 flex items-baseline gap-1 whitespace-nowrap text-[13px] font-medium", mineShares > 0 ? "opacity-70" : "text-ink/60")}>
            {item.qty > 1 && (
              <>
                {item.qty} × <Amount amount={item.price} currency={currency} size="sm" />
              </>
            )}
            {!unclaimed && custom && <span>{item.qty > 1 ? "· " : ""}custom shares</span>}
          </span>
        )}
        {unclaimed && <span className="mt-1 block text-[13px] font-semibold text-owe-ink">Nobody yet · tap if it&apos;s yours</span>}
        {!unclaimed && (
          <span className="mt-2 flex flex-wrap gap-1">
            {who.map((c) => {
              const m = membersById.get(c.member_id);
              if (!m) return null;
              return (
                <span key={c.member_id} className="relative">
                  <Avatar {...memberAvatar(m)} size="sm" />
                  {c.shares > 1 && (
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-bg">
                      {c.shares}
                    </span>
                  )}
                </span>
              );
            })}
          </span>
        )}
      </span>
      <Amount amount={itemCost(item)} currency={currency} size="md" />
    </motion.button>
  );
}

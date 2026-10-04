"use client";

import { ArrowRight, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AmountOverlay } from "@/components/features/expense/AmountOverlay";
import { Amount, Avatar, Button, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError, microDate } from "@/lib/groups";
import { memberAvatar, type GroupWithMembers, type MemberWithProfile } from "@/lib/groups-data";
import { pastelVar } from "@/lib/pastels";
import { useRecordSettlement } from "@/lib/queries/settlements";
import { clearsDebt, myTransfers, plannedAmount } from "@/lib/settle";
import type { Transfer } from "@/lib/simplify";
import type { SettlementMethod } from "@/lib/supabase/types";
import { buildUpiLink, canPayViaUpi } from "@/lib/upi";

type Step = "pick" | "details" | "upi-wait" | "upi-confirm" | "done";

interface Pending {
  from: string;
  to: string;
  amount: number;
}

/**
 * Settle up (PRD › Settle up): pick the person (or arrive prefilled from a Balances row), adjust the
 * amount for a partial payment, then pay via UPI (INR + receiver has a UPI ID) or mark as paid.
 */
export function SettleSheet({
  open,
  onClose,
  group,
  me,
  plan,
  prefill,
  onSettledUp,
  onTypingChange,
}: {
  open: boolean;
  onClose: () => void;
  group: GroupWithMembers;
  me: MemberWithProfile;
  plan: Transfer[];
  /** Opened from a Balances row: skip the picker. */
  prefill: Transfer | null;
  /** Fired when a payment clears the whole planned debt (confetti). */
  onSettledUp: () => void;
  /** Presence: true while this sheet is open (others see "… is settling up"). */
  onTypingChange?: (typing: boolean) => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  const [pending, setPending] = useState<Pending | null>(null);
  const [amountOpen, setAmountOpen] = useState(false);
  const [recorded, setRecorded] = useState<{ p: Pending; method: SettlementMethod; byReceiver: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = useRef("");
  const record = useRecordSettlement(group.id, { myUserId: me.user_id ?? "", myMemberId: me.id, currency: group.base_currency });
  // The plan as it was when the sheet opened: "did this clear the debt?" compares against it.
  const planAtOpen = useRef<Transfer[]>(plan);

  useEffect(() => {
    onTypingChange?.(open);
  }, [open, onTypingChange]);

  useEffect(() => {
    if (!open) return;
    planAtOpen.current = plan;
    setError(null);
    setRecorded(null);
    if (prefill) {
      setPending({ ...prefill });
      clientId.current = crypto.randomUUID();
      setStep("details");
    } else {
      setPending(null);
      setStep("pick");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened
  }, [open]);

  const byId = new Map(group.members.map((m) => [m.id, m]));
  const label = (id: string) => (id === me.id ? "You" : byId.get(id)?.display_name.split(" ")[0] ?? "Someone");
  const currency = group.base_currency;

  const save = useCallback(
    async (p: Pending, method: SettlementMethod) => {
      setError(null);
      try {
        // Optimistic: the payment shows in the group immediately; the sheet waits for the server.
        await record.mutateAsync({ ...p, method, clientId: clientId.current, silent: true });
        setRecorded({ p, method, byReceiver: p.to === me.id });
        setStep("done");
        if (clearsDebt(planAtOpen.current, p.from, p.to, p.amount)) onSettledUp();
      } catch (err) {
        setError(friendlyError(err));
        setStep("details");
      }
    },
    [record, me.id, onSettledUp],
  );

  // Back from the UPI app: ask whether it went through (PRD › PWA constraints).
  useEffect(() => {
    if (step !== "upi-wait") return;
    const onVisible = () => document.visibilityState === "visible" && setStep("upi-confirm");
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [step]);

  const receiver = pending ? byId.get(pending.to) : undefined;
  const upiOk = !!pending && pending.from === me.id && canPayViaUpi(currency, receiver?.profile?.upi_id);
  const owed = pending ? plannedAmount(planAtOpen.current, pending.from, pending.to) : 0;

  // A real link (not a script redirect): a tapped upi:// link is what iOS Safari and installed
  // PWAs reliably hand to GPay / PhonePe / Paytm.
  const upiLink =
    upiOk && pending && receiver?.profile?.upi_id
      ? buildUpiLink({ upiId: receiver.profile.upi_id, name: receiver.display_name, amountMinor: pending.amount, groupName: group.name })
      : null;

  const choices = myTransfers(planAtOpen.current.length ? planAtOpen.current : plan, me.id);

  return (
    <>
      <Sheet open={open && !amountOpen} onClose={onClose} title="Settle up">
        {step === "pick" && (
          <div>
            {choices.length === 0 ? (
              <p className="py-6 text-center text-[15px] font-medium text-ink/60">You&apos;re all square in this group. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {choices.map((t) => (
                  <li key={`${t.from}-${t.to}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setPending({ ...t });
                        clientId.current = crypto.randomUUID();
                        setStep("details");
                      }}
                      className="flex w-full items-center gap-3 rounded-card border-[1.5px] border-ink/[0.08] bg-surface p-4 text-left hover:bg-ink/[0.02]"
                    >
                      <Pair from={byId.get(t.from)} to={byId.get(t.to)} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                        {t.from === me.id ? `You pay ${label(t.to)}` : `${label(t.from)} pays you`}
                      </span>
                      <Amount amount={t.amount} currency={currency} size="md" sign={t.from === me.id ? "owe" : "owed"} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {step === "details" && pending && (
          <div>
            <div className="flex items-center gap-3">
              <Pair from={byId.get(pending.from)} to={byId.get(pending.to)} size="lg" />
              <p className="text-[15px] font-semibold">
                {pending.from === me.id ? `You pay ${label(pending.to)}` : `${label(pending.from)} pays you`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAmountOpen(true)}
              className="-mx-2 mt-5 flex w-[calc(100%+16px)] items-end justify-between rounded-2xl px-2 py-1 text-left hover:bg-ink/[0.03]"
              aria-label="Change amount"
            >
              <Amount amount={pending.amount} currency={currency} size="xl" unblurrable />
              <span className="micro mb-2 text-ink-faded">Edit</span>
            </button>
            {owed > 0 && pending.amount !== owed && (
              <p className="mt-2 flex items-baseline gap-1 text-[13px] font-semibold text-ink/60">
                {pending.amount < owed ? (
                  <>
                    Partial payment ·
                    <Amount amount={owed - pending.amount} currency={currency} size="sm" /> still left
                  </>
                ) : (
                  <>
                    More than the
                    <Amount amount={owed} currency={currency} size="sm" /> owed
                  </>
                )}
              </p>
            )}

            {error && (
              <p role="alert" className="mt-4 text-center text-[14px] font-medium text-owe">
                {error}
              </p>
            )}

            <div className="mt-8 space-y-2">
              {pending.from === me.id ? (
                <>
                  {upiLink && (
                    <a
                      href={upiLink}
                      onClick={() => setStep("upi-wait")}
                      className="flex h-14 w-full items-center justify-center rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
                    >
                      Pay via UPI
                    </a>
                  )}
                  <MarkPaid
                    label="Mark as paid"
                    primary={!upiOk}
                    busy={record.isPending}
                    onPick={(method) => save(pending, method)}
                  />
                  {!upiOk && currency === "INR" && (
                    <p className="pt-1 text-center text-[12px] font-medium text-ink/50">
                      {label(pending.to)} hasn&apos;t added a UPI ID, so pay them however you like and mark it here.
                    </p>
                  )}
                </>
              ) : (
                <MarkPaid
                  label="Mark as received"
                  primary
                  busy={record.isPending}
                  allowUpi={currency === "INR"}
                  onPick={(method) => save(pending, method)}
                />
              )}
            </div>
          </div>
        )}

        {step === "upi-wait" && pending && (
          <div className="py-6 text-center">
            <p className="font-display text-[44px] uppercase leading-[0.9]">Opening</p>
            <p className="font-display text-[44px] uppercase leading-[0.9] text-ink-faded">your UPI app</p>
            <p className="mx-auto mt-4 max-w-[280px] text-[14px] font-medium text-ink/60">
              Pay in GPay, PhonePe or Paytm, then come back here.
            </p>
            <Button variant="ghost" className="mt-6" onClick={() => setStep("upi-confirm")}>
              I&apos;m back
            </Button>
          </div>
        )}

        {step === "upi-confirm" && pending && (
          <div className="py-2 text-center">
            <p className="font-display text-[44px] uppercase leading-[0.9]">Did it</p>
            <p className="font-display text-[44px] uppercase leading-[0.9] text-ink-faded">go through?</p>
            <div className="mt-3 flex justify-center">
              <Amount amount={pending.amount} currency={currency} size="lg" />
            </div>
            <div className="mt-8 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setStep("details")} disabled={record.isPending}>
                No
              </Button>
              <Button onClick={() => save(pending, "upi")} disabled={record.isPending}>
                {record.isPending ? "Saving…" : "Yes, paid"}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && recorded && (
          <div>
            {/* Receipt placeholder: the shareable poster card is rendered by the server in Milestone 7. */}
            <div
              className="relative overflow-hidden rounded-card border-[1.5px] border-on-pastel/[0.08] p-6 text-on-pastel"
              style={{ backgroundColor: pastelVar(group.color) }}
            >
              <p className="micro opacity-60">
                {group.name} · {microDate(new Date().toISOString())}
              </p>
              <p className="mt-4 font-display text-[40px] uppercase leading-[0.9]">
                {label(recorded.p.from)}
                <br />
                <span className="opacity-40">→</span> {label(recorded.p.to)}
              </p>
              <Amount amount={recorded.p.amount} currency={currency} size="xl" className="mt-4" />
              <span className="absolute right-5 top-5 flex rotate-6 items-center gap-1 rounded-full border-2 border-on-pastel px-3 py-1 font-display-alt text-[18px] uppercase">
                Settld <Check className="size-4" strokeWidth={3} />
              </span>
            </div>
            <p className="mt-4 text-center text-[14px] font-medium text-ink/70">
              {recorded.byReceiver
                ? "Recorded and confirmed."
                : `Recorded. ${label(recorded.p.to)} can confirm it from the group.`}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled title="Coming soon">
                Share receipt
              </Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </Sheet>

      <AmountOverlay
        open={open && amountOpen}
        currency={currency}
        initialMinor={pending?.amount ?? 0}
        label="Amount paid"
        onClose={() => setAmountOpen(false)}
        onDone={(amount) => {
          setPending((p) => (p ? { ...p, amount } : p));
          setAmountOpen(false);
        }}
      />
    </>
  );
}

function Pair({ from, to, size = "sm" }: { from?: MemberWithProfile; to?: MemberWithProfile; size?: "sm" | "lg" }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {from && <Avatar {...memberAvatar(from)} size={size === "lg" ? "md" : "sm"} />}
      <ArrowRight className="size-4 text-ink/40" aria-hidden />
      {to && <Avatar {...memberAvatar(to)} size={size === "lg" ? "md" : "sm"} />}
    </span>
  );
}

function MarkPaid({
  label,
  primary,
  busy,
  allowUpi = false,
  onPick,
}: {
  label: string;
  primary?: boolean;
  busy: boolean;
  allowUpi?: boolean;
  onPick: (method: SettlementMethod) => void;
}) {
  const options: { value: SettlementMethod; label: string }[] = [
    { value: "cash", label: "Cash" },
    ...(allowUpi ? [{ value: "upi" as const, label: "UPI" }] : []),
    { value: "other", label: "Other" },
  ];
  const [method, setMethod] = useState<SettlementMethod>("cash");
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="How was it paid?" className="grid gap-1 rounded-full bg-ink/[0.06] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={method === o.value}
            onClick={() => setMethod(o.value)}
            className={cn(
              "h-9 rounded-full text-[13px] font-semibold transition-colors",
              method === o.value ? "bg-surface text-ink shadow-[0_0_0_1.5px_rgb(var(--ink-rgb)/0.08)]" : "text-ink/50",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <Button variant={primary ? "primary" : "secondary"} fullWidth onClick={() => onPick(method)} disabled={busy}>
        {busy ? "Saving…" : label}
      </Button>
    </div>
  );
}

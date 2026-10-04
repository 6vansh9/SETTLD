"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TextField } from "@/components/features/profile/TextField";
import { Amount, Avatar, Button, Sheet } from "@/components/ui";
import { CATEGORIES, CATEGORY_META } from "@/lib/categories";
import { cn } from "@/lib/cn";
import {
  draftFromExpense,
  evaluateDraft,
  newDraft,
  toRpcArgs,
  type DraftEvaluation,
  type ExpenseDraft,
  type ExpenseRpcArgs,
} from "@/lib/expense-form";
import type { ExpenseWithLines } from "@/lib/expenses-data";
import { activeMembers, memberAvatar, type GroupWithMembers, type MemberWithProfile } from "@/lib/groups-data";
import { CURRENCIES, CURRENCY_CODES, formatPercent, type CurrencyCode, type SplitType } from "@/lib/money";
import { useCreateExpense, useUpdateExpense } from "@/lib/queries/expenses";
import { AmountOverlay } from "./AmountOverlay";

const SPLIT_TABS: { value: SplitType; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "exact", label: "Exact" },
  { value: "percent", label: "%" },
  { value: "shares", label: "Shares" },
];

/**
 * Add Expense (PRD › Screens › Add expense): full-screen numpad first, then the details sheet.
 * Pass `expense` to edit an existing one (opens straight on the details).
 */
export function ExpenseEditor({
  open,
  onClose,
  onSaved,
  group,
  myMemberId,
  myUserId,
  expense,
  onTypingChange,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (title: string, mode: "created" | "updated") => void;
  group: GroupWithMembers;
  myMemberId: string;
  myUserId: string;
  expense?: ExpenseWithLines | null;
  /** Presence: true while this editor is open (others see "… is adding an expense"). */
  onTypingChange?: (typing: boolean) => void;
}) {
  const members = useMemo(() => activeMembers(group), [group]);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const base = group.base_currency;
  const [draft, setDraft] = useState<ExpenseDraft>(() => newDraft(memberIds, myMemberId, undefined, base));
  const [amountOpen, setAmountOpen] = useState(false);
  const clientId = useRef<string>("");
  // Mutations live here (always mounted), not in the form inside the sheet: the sheet closes
  // before the server answers, and the error toast's Retry must still work afterwards.
  const create = useCreateExpense(group.id, myUserId);
  const update = useUpdateExpense(group.id);

  useEffect(() => {
    onTypingChange?.(open);
  }, [open, onTypingChange]);

  // Fresh draft (and a fresh idempotency key) every time the editor opens.
  useEffect(() => {
    if (!open) return;
    clientId.current = crypto.randomUUID();
    setDraft(expense ? draftFromExpense(expense, base) : newDraft(memberIds, myMemberId, undefined, base));
    setAmountOpen(!expense);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened
  }, [open, expense?.id]);

  const closeAmount = () => {
    // Closing the numpad before any amount was entered cancels the whole thing.
    if (draft.amount === 0) onClose();
    setAmountOpen(false);
  };

  return (
    <>
      <AmountOverlay
        open={open && amountOpen}
        currency={draft.currency}
        initialMinor={draft.amount}
        label={expense ? "Edit amount" : `New expense · ${group.name}`}
        onClose={closeAmount}
        onDone={(amount) => {
          setDraft((d) => ({ ...d, amount }));
          setAmountOpen(false);
        }}
      />
      <Sheet open={open && !amountOpen} onClose={onClose} title={expense ? "Edit expense" : "New expense"}>
        <ExpenseForm
          draft={draft}
          setDraft={setDraft}
          members={members}
          baseCurrency={base}
          myMemberId={myMemberId}
          editingId={expense?.id ?? null}
          onSubmit={(args) => {
            if (expense) update.mutate({ expenseId: expense.id, args });
            else create.mutate({ args, clientId: clientId.current });
          }}
          onEditAmount={() => setAmountOpen(true)}
          onSaved={(title) => {
            onSaved?.(title, expense ? "updated" : "created");
            onClose();
          }}
        />
      </Sheet>
    </>
  );
}

function ExpenseForm({
  draft,
  setDraft,
  members,
  baseCurrency,
  myMemberId,
  editingId,
  onSubmit,
  onEditAmount,
  onSaved,
}: {
  draft: ExpenseDraft;
  setDraft: React.Dispatch<React.SetStateAction<ExpenseDraft>>;
  members: MemberWithProfile[];
  baseCurrency: CurrencyCode;
  myMemberId: string;
  editingId: string | null;
  onSubmit: (args: ExpenseRpcArgs) => void;
  onEditAmount: () => void;
  onSaved: (title: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [triedSave, setTriedSave] = useState(false);
  const order = members.map((m) => m.id);
  // Everything is typed in the expense currency; validation converts to the group's.
  const currency = draft.currency;
  const evaluation = evaluateDraft(draft, order, baseCurrency);
  const saving = false; // optimistic: the sheet closes on submit
  const set = <K extends keyof ExpenseDraft>(key: K, value: ExpenseDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Optimistic: the expense is already in the list (and balances) when the sheet closes.
  // If the server refuses it, it's rolled back and a toast offers Retry (same client_id).
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSave(true);
    if (!evaluation.canSave) return;
    setError(null);
    const args = toRpcArgs(draft, evaluation);
    onSubmit(args);
    onSaved(args.title);
  };

  return (
    <form onSubmit={save} noValidate className="pb-2">
      {/* Amount: tap to reopen the numpad */}
      <button
        type="button"
        onClick={onEditAmount}
        className="-mx-2 flex w-[calc(100%+16px)] items-end justify-between rounded-2xl px-2 py-1 text-left hover:bg-ink/[0.03]"
        aria-label="Change amount"
      >
        <Amount amount={draft.amount} currency={currency} size="xl" unblurrable />
        <span className="micro mb-2 text-ink-faded">Edit</span>
      </button>

      <CurrencyAndRate draft={draft} setDraft={setDraft} baseCurrency={baseCurrency} evaluation={evaluation} />

      <div className="mt-6 space-y-6">
        <TextField
          label="What was it?"
          placeholder="Dinner at Thalassa"
          maxLength={80}
          autoComplete="off"
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          error={triedSave ? evaluation.errors.title : null}
        />

        <Field label="Category">
          <div role="radiogroup" aria-label="Category" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {CATEGORIES.map((c) => {
              const { label, Icon } = CATEGORY_META[c];
              const active = draft.category === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set("category", c)}
                  className={cn(
                    "flex h-10 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[13px] font-semibold transition-colors",
                    active ? "border-ink bg-ink text-bg" : "border-ink/15 text-ink",
                  )}
                >
                  <Icon className="size-4" strokeWidth={2.25} />
                  {label}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Date" htmlFor="expense-date">
          <input
            id="expense-date"
            type="date"
            value={draft.date}
            max="2100-12-31"
            onChange={(e) => e.target.value && set("date", e.target.value)}
            className="h-12 w-full rounded-2xl border-[1.5px] border-ink/15 bg-surface px-4 text-[15px] font-medium text-ink focus:border-ink focus:outline-none [color-scheme:inherit]"
          />
        </Field>

        <PaidBy draft={draft} setDraft={setDraft} members={members} currency={currency} myMemberId={myMemberId} evaluation={evaluation} />

        <SplitSection draft={draft} setDraft={setDraft} members={members} currency={currency} myMemberId={myMemberId} evaluation={evaluation} />

        <Field label="Note (optional)" htmlFor="expense-note">
          <textarea
            id="expense-note"
            rows={2}
            maxLength={500}
            value={draft.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Anything worth remembering"
            className="w-full resize-none rounded-2xl border-[1.5px] border-ink/15 bg-surface px-4 py-3 text-[15px] font-medium text-ink placeholder:text-ink/25 focus:border-ink focus:outline-none"
          />
        </Field>
      </div>

      {/* Sticky footer: what's left to assign, and Save */}
      <div className="sticky bottom-0 -mx-5 mt-6 border-t-[1.5px] border-ink/[0.06] bg-surface px-5 pt-3">
        <LeftToAssign evaluation={evaluation} currency={currency} />
        {error && (
          <p role="alert" className="mb-2 text-center text-[14px] font-medium text-owe">
            {error}
          </p>
        )}
        {evaluation.errors.rate && draft.currency !== baseCurrency && draft.amount > 0 && (
          <p className="mb-2 text-center text-[13px] font-medium text-ink/60">{evaluation.errors.rate}</p>
        )}
        {triedSave && !evaluation.canSave && !evaluation.splitLeft && !evaluation.payersLeft && (
          <p role="alert" className="mb-2 text-center text-[13px] font-medium text-owe">
            {Object.values(evaluation.errors)[0]}
          </p>
        )}
        <Button
          type="submit"
          fullWidth
          disabled={
            saving || !!evaluation.splitLeft || !!evaluation.payersLeft || !!evaluation.errors.rate || (triedSave && !evaluation.canSave)
          }
        >
          {saving ? "Saving…" : editingId ? "Save changes" : "Add expense"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  const Label = htmlFor ? "label" : "p";
  return (
    <div>
      <Label htmlFor={htmlFor} className="micro mb-2 block text-ink-faded">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** "₹40 left to assign" / "₹10 over" / "25% left" — blocks saving until zero. */
function LeftToAssign({ evaluation, currency }: { evaluation: DraftEvaluation; currency: CurrencyCode }) {
  const items: React.ReactNode[] = [];
  const { splitLeft, payersLeft } = evaluation;
  if (payersLeft) {
    items.push(
      <span key="p" className="flex items-baseline gap-1.5">
        <Amount amount={Math.abs(payersLeft)} currency={currency} size="sm" sign={payersLeft < 0 ? "owe" : undefined} unblurrable />
        <span>{payersLeft > 0 ? "still to pay" : "paid too much"}</span>
      </span>,
    );
  }
  if (splitLeft) {
    items.push(
      <span key="s" className="flex items-baseline gap-1.5">
        {splitLeft.kind === "amount" ? (
          <Amount amount={Math.abs(splitLeft.value)} currency={currency} size="sm" sign={splitLeft.value < 0 ? "owe" : undefined} unblurrable />
        ) : (
          <span className={cn("font-num text-[20px] leading-none", splitLeft.value < 0 && "text-owe")}>
            {formatPercent(Math.abs(splitLeft.value))}%
          </span>
        )}
        <span>{splitLeft.value > 0 ? "left to assign" : "over"}</span>
      </span>,
    );
  }
  if (items.length === 0) return null;
  return (
    <div role="status" aria-live="polite" className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[13px] font-semibold text-ink/70">
      {items}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="grid rounded-full bg-ink/[0.06] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-full text-[13px] font-semibold transition-colors",
            value === o.value ? "bg-surface text-ink shadow-[0_0_0_1.5px_rgb(var(--ink-rgb)/0.08)]" : "text-ink/50",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  currency,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  currency: CurrencyCode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex h-11 w-32 items-center rounded-xl border-[1.5px] border-ink/15 bg-bg px-3 focus-within:border-ink", disabled && "opacity-40")}>
      <span className="font-num text-[18px] leading-none text-ink-faded" aria-hidden>
        {CURRENCIES[currency].symbol}
      </span>
      <input
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        className="w-full min-w-0 bg-transparent pl-1.5 text-right font-num text-[22px] leading-none text-ink placeholder:text-ink/25 focus:outline-none"
      />
    </label>
  );
}

function PaidBy({
  draft,
  setDraft,
  members,
  currency,
  myMemberId,
}: {
  draft: ExpenseDraft;
  setDraft: React.Dispatch<React.SetStateAction<ExpenseDraft>>;
  members: MemberWithProfile[];
  currency: CurrencyCode;
  myMemberId: string;
  evaluation: DraftEvaluation;
}) {
  const name = (m: MemberWithProfile) => (m.id === myMemberId ? "You" : m.display_name.split(" ")[0]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="micro text-ink-faded">Paid by</p>
      </div>
      <Segmented
        label="Payers"
        value={draft.payerMode}
        options={[
          { value: "single", label: "One person" },
          { value: "multiple", label: "Multiple people" },
        ]}
        onChange={(payerMode) => setDraft((d) => ({ ...d, payerMode }))}
      />
      {draft.payerMode === "single" ? (
        <div role="radiogroup" aria-label="Who paid" className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {members.map((m) => {
            const active = draft.payerId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDraft((d) => ({ ...d, payerId: m.id }))}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <span className={cn("rounded-full p-0.5 ring-[2.5px] transition-colors", active ? "ring-ink" : "ring-transparent")}>
                  <Avatar {...memberAvatar(m)} size="lg" />
                </span>
                <span className={cn("w-full truncate text-center text-[12px] font-semibold", !active && "text-ink/50")}>{name(m)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <ul className="divide-y-[1.5px] divide-ink/[0.06]">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <Avatar {...memberAvatar(m)} size="md" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name(m)}</span>
              <MoneyInput
                label={`${name(m)} paid`}
                currency={currency}
                value={draft.payerAmounts[m.id] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, payerAmounts: { ...d.payerAmounts, [m.id]: v } }))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SplitSection({
  draft,
  setDraft,
  members,
  currency,
  myMemberId,
  evaluation,
}: {
  draft: ExpenseDraft;
  setDraft: React.Dispatch<React.SetStateAction<ExpenseDraft>>;
  members: MemberWithProfile[];
  currency: CurrencyCode;
  myMemberId: string;
  evaluation: DraftEvaluation;
}) {
  const name = (m: MemberWithProfile) => (m.id === myMemberId ? "You" : m.display_name.split(" ")[0]);
  const toggle = (id: string) =>
    setDraft((d) => ({ ...d, included: d.included.includes(id) ? d.included.filter((x) => x !== id) : [...d.included, id] }));
  const setValue = (field: "exact" | "percent" | "shares", id: string, v: string) =>
    setDraft((d) => ({ ...d, [field]: { ...d[field], [id]: v } }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="micro text-ink-faded">Split</p>
        <button
          type="button"
          className="micro text-ink-faded hover:text-ink"
          onClick={() =>
            setDraft((d) => ({ ...d, included: d.included.length === members.length ? [] : members.map((m) => m.id) }))
          }
        >
          {draft.included.length === members.length ? "Clear all" : "Everyone"}
        </button>
      </div>
      <Segmented label="Split type" value={draft.splitType} options={SPLIT_TABS} onChange={(splitType) => setDraft((d) => ({ ...d, splitType }))} />

      <ul className="divide-y-[1.5px] divide-ink/[0.06]">
        {members.map((m) => {
          const included = draft.included.includes(m.id);
          const share = evaluation.splitAmounts.get(m.id);
          return (
            <li key={m.id} className="flex min-h-14 items-center gap-3 py-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={included}
                aria-label={`Include ${name(m)}`}
                onClick={() => toggle(m.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="relative">
                  <Avatar {...memberAvatar(m)} size="md" className={cn(!included && "opacity-35 grayscale")} />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full border-2 border-surface transition-colors",
                      included ? "bg-ink text-bg" : "bg-ink/15",
                    )}
                  >
                    {included && <Check className="size-2.5" strokeWidth={4} />}
                  </span>
                </span>
                <span className={cn("truncate text-[15px] font-semibold", !included && "text-ink/35")}>{name(m)}</span>
              </button>

              {included && draft.splitType === "exact" && (
                <MoneyInput label={`${name(m)}'s share`} currency={currency} value={draft.exact[m.id] ?? ""} onChange={(v) => setValue("exact", m.id, v)} />
              )}

              {included && draft.splitType === "percent" && (
                <div className="flex items-center gap-2">
                  {share !== undefined && <Amount amount={share} currency={currency} size="sm" className="text-ink/50" unblurrable />}
                  <label className="flex h-11 w-[84px] items-center rounded-xl border-[1.5px] border-ink/15 bg-bg px-3 focus-within:border-ink">
                    <input
                      aria-label={`${name(m)}'s percentage`}
                      inputMode="decimal"
                      placeholder="0"
                      value={draft.percent[m.id] ?? ""}
                      onChange={(e) => setValue("percent", m.id, e.target.value.replace(/[^\d.]/g, ""))}
                      className="w-full min-w-0 bg-transparent text-right font-num text-[22px] leading-none text-ink placeholder:text-ink/25 focus:outline-none"
                    />
                    <span className="pl-0.5 font-num text-[18px] text-ink-faded">%</span>
                  </label>
                </div>
              )}

              {included && draft.splitType === "shares" && (
                <div className="flex items-center gap-2">
                  {share !== undefined && <Amount amount={share} currency={currency} size="sm" className="text-ink/50" unblurrable />}
                  <ShareStepper
                    label={name(m)}
                    value={Number(draft.shares[m.id] ?? "1") || 0}
                    onChange={(n) => setValue("shares", m.id, String(n))}
                  />
                </div>
              )}

              {included && draft.splitType === "equal" && share !== undefined && (
                <Amount amount={share} currency={currency} size="sm" unblurrable />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ShareStepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center rounded-xl border-[1.5px] border-ink/15 bg-bg" role="group" aria-label={`${label}'s shares`}>
      <button type="button" aria-label={`Fewer shares for ${label}`} onClick={() => onChange(Math.max(0, value - 1))} className="flex size-10 items-center justify-center text-ink/60">
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <span className="w-7 text-center font-num text-[22px] leading-none" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label={`More shares for ${label}`} onClick={() => onChange(Math.min(1000, value + 1))} className="flex size-10 items-center justify-center text-ink/60">
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

type RateStatus = { state: "idle" | "loading" | "ready" | "error"; source?: string; fetchedAt?: string; message?: string };

/**
 * Currency chip + exchange rate (PRD › Currencies). For a foreign currency the rate comes from
 * /api/fx (server-side, cached); the user can override it, and the expense stores whatever rate
 * was used, so balances never drift.
 */
function CurrencyAndRate({
  draft,
  setDraft,
  baseCurrency,
  evaluation,
}: {
  draft: ExpenseDraft;
  setDraft: React.Dispatch<React.SetStateAction<ExpenseDraft>>;
  baseCurrency: CurrencyCode;
  evaluation: DraftEvaluation;
}) {
  const [status, setStatus] = useState<RateStatus>({ state: "idle" });
  const [editing, setEditing] = useState(false);
  const foreign = draft.currency !== baseCurrency;
  const wantsFetch = foreign && draft.rateSource === "auto";

  useEffect(() => {
    if (!wantsFetch) return;
    const controller = new AbortController();
    setStatus({ state: "loading" });
    fetch(`/api/fx?from=${draft.currency}&to=${baseCurrency}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Rate unavailable");
        setDraft((d) => (d.currency === body.base && d.rateSource === "auto" ? { ...d, rate: body.rate } : d));
        setStatus({ state: "ready", source: body.source, fetchedAt: body.fetchedAt });
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setStatus({ state: "error", message: "Couldn't get today's rate. Enter it yourself." });
        setEditing(true);
      });
    return () => controller.abort();
  }, [wantsFetch, draft.currency, baseCurrency, setDraft]);

  const pick = (c: CurrencyCode) => {
    setEditing(false);
    setDraft((d) => ({ ...d, currency: c, rate: c === baseCurrency ? "1" : "", rateSource: "auto" }));
  };

  return (
    <div className="mt-3">
      <div role="radiogroup" aria-label="Currency" className="flex gap-1.5">
        {CURRENCY_CODES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={draft.currency === c}
            onClick={() => pick(c)}
            className={cn(
              "h-8 flex-1 rounded-full border-[1.5px] text-[12px] font-semibold transition-colors",
              draft.currency === c ? "border-ink bg-ink text-bg" : "border-ink/15 text-ink/70",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {foreign && (
        <div className="mt-3 rounded-2xl bg-ink/[0.04] px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex items-baseline gap-1.5 text-[13px] font-semibold text-ink/60">
              ≈
              {evaluation.amountBase !== null ? (
                <Amount amount={evaluation.amountBase} currency={baseCurrency} size="md" unblurrable />
              ) : (
                <span className="font-num text-[24px] leading-none text-ink/30">…</span>
              )}
            </span>
            {!editing && (
              <button type="button" onClick={() => setEditing(true)} className="micro text-ink-faded hover:text-ink">
                Edit rate
              </button>
            )}
          </div>
          <p className="mt-1 text-[12px] font-medium text-ink/50" aria-live="polite">
            {status.state === "loading" && draft.rateSource === "auto"
              ? "Getting today's rate…"
              : evaluation.rate
                ? `1 ${draft.currency} = ${CURRENCIES[baseCurrency].symbol}${evaluation.rate} · ${
                    draft.rateSource === "manual"
                      ? "your rate"
                      : status.source === "stale"
                        ? "last known rate (offline)"
                        : "today's rate"
                  }`
                : status.message ?? ""}
          </p>
          {editing && (
            <div className="mt-3 flex items-center gap-2">
              <label className="flex h-11 flex-1 items-center rounded-xl border-[1.5px] border-ink/15 bg-surface px-3 focus-within:border-ink">
                <span className="whitespace-nowrap text-[13px] font-semibold text-ink/50">
                  1 {draft.currency} = {CURRENCIES[baseCurrency].symbol}
                </span>
                <input
                  aria-label={`Exchange rate, ${baseCurrency} per ${draft.currency}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={draft.rate}
                  placeholder="0.00"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, rate: e.target.value.replace(/[^\d.]/g, ""), rateSource: "manual" }))
                  }
                  className="w-full min-w-0 bg-transparent pl-1.5 text-right font-num text-[22px] leading-none text-ink focus:outline-none"
                />
              </label>
              {draft.rateSource === "manual" && (
                <Button
                  variant="ghost"
                  className="h-11 px-3 text-[13px]"
                  onClick={() => {
                    setEditing(false);
                    setDraft((d) => ({ ...d, rate: "", rateSource: "auto" }));
                  }}
                >
                  Use today&apos;s
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

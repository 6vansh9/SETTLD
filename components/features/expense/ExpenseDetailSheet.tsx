"use client";

import { CommentThread, ReactionsRow, useMarkOpenSeen } from "@/components/features/social/GroupSocial";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Amount, Avatar, Button, Sheet, SplitBar } from "@/components/ui";
import { CATEGORY_META, isCategory } from "@/lib/categories";
import type { ExpenseWithLines } from "@/lib/expenses-data";
import { microDay } from "@/lib/groups";
import { memberAvatar, type GroupWithMembers, type MemberWithProfile } from "@/lib/groups-data";
import { CURRENCIES, formatPercent, fromMinor, parseRate, rateToString } from "@/lib/money";
import type { Pastel } from "@/lib/pastels";

/** Who can change an expense, and if not, why (mirrors expense_for_change in 0004_expenses.sql). */
export function expensePermissions(
  e: ExpenseWithLines,
  group: GroupWithMembers,
  myUserId: string,
): { canChange: boolean; reason: string | null } {
  const me = group.members.find((m) => m.user_id === myUserId && !m.left_at);
  if (!me) return { canChange: false, reason: null };
  if (group.archived_at) return { canChange: false, reason: "This group is archived, so expenses are read-only." };
  const involved = new Set([...e.payers.map((p) => p.member_id), ...e.splits.map((s) => s.member_id)]);
  const departed = group.members.find((m) => involved.has(m.id) && m.left_at);
  if (departed) {
    return { canChange: false, reason: `${departed.display_name} has left the group, so this expense is locked to keep their balance at zero.` };
  }
  if (e.created_by !== myUserId && me.role !== "admin") {
    return { canChange: false, reason: "Only the person who added it or an admin can change it." };
  }
  return { canChange: true, reason: null };
}

export function ExpenseDetailSheet({
  expense,
  onClose,
  group,
  myUserId,
  onEdit,
  onDelete,
}: {
  expense: ExpenseWithLines | null;
  onClose: () => void;
  group: GroupWithMembers;
  myUserId: string;
  onEdit: (e: ExpenseWithLines) => void;
  onDelete: (e: ExpenseWithLines) => void;
}) {
  return (
    <Sheet open={!!expense} onClose={onClose} title="Expense" hideTitle>
      {expense && <Detail expense={expense} group={group} myUserId={myUserId} onEdit={onEdit} onDelete={onDelete} />}
    </Sheet>
  );
}

function Detail({
  expense: e,
  group,
  myUserId,
  onEdit,
  onDelete,
}: {
  expense: ExpenseWithLines;
  group: GroupWithMembers;
  myUserId: string;
  onEdit: (e: ExpenseWithLines) => void;
  onDelete: (e: ExpenseWithLines) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  useMarkOpenSeen("expense", e.id.startsWith("temp-") ? null : e.id);
  const byId = new Map(group.members.map((m) => [m.id, m]));
  const name = (id: string) => {
    const m = byId.get(id);
    if (!m) return "Someone";
    return m.user_id === myUserId ? "You" : m.display_name;
  };
  const { Icon, label } = CATEGORY_META[isCategory(e.category) ? e.category : "other"];
  const { canChange, reason } = expensePermissions(e, group, myUserId);
  const splitType = e.splits[0]?.split_type ?? "equal";

  const rawLabel = (raw: number | null) => {
    if (raw === null) return null;
    // Exact amounts were typed in the expense currency; worth showing when it isn't the group's.
    if (splitType === "exact" && e.currency !== group.base_currency) return `${CURRENCIES[e.currency].symbol}${fromMinor(raw, e.currency)}`;
    if (splitType === "percent") return `${formatPercent(raw)}%`;
    if (splitType === "shares") return `${raw} ${raw === 1 ? "share" : "shares"}`;
    return null;
  };

  return (
    <div>
      <div className="flex items-center gap-2 text-ink/60">
        <Icon className="size-4" strokeWidth={2.25} aria-hidden />
        <span className="micro">
          {label} · {microDay(e.date)}
        </span>
      </div>
      <h2 className="mt-3 break-words font-display-alt text-[40px] uppercase leading-[0.9]">{e.title}</h2>
      <Amount amount={e.amount} currency={e.currency} size="hero" className="mt-4" />
      {e.currency !== group.base_currency && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[13px] font-semibold text-ink/60">
          <span className="flex items-baseline gap-1">
            = <Amount amount={e.amount_base} currency={group.base_currency} size="md" />
          </span>
          <span>
            at 1 {e.currency} = {CURRENCIES[group.base_currency].symbol}
            {rateLabel(e.fx_rate_to_base)}
          </span>
        </p>
      )}

      <section className="mt-6" aria-labelledby="paid-by">
        <h3 id="paid-by" className="micro mb-2 text-ink-faded">
          Paid by
        </h3>
        <ul className="space-y-2">
          {e.payers.map((p) => (
            <PersonRow key={p.member_id} member={byId.get(p.member_id)} name={name(p.member_id)} amount={p.amount_base} currency={group.base_currency} />
          ))}
        </ul>
      </section>

      <section className="mt-6" aria-labelledby="split-for">
        <h3 id="split-for" className="micro mb-3 text-ink-faded">
          Split {splitType === "equal" ? "equally" : splitType === "exact" ? "by amount" : splitType === "percent" ? "by percentage" : "by shares"}
        </h3>
        <SplitBar
          segments={e.splits
            .filter((s) => s.amount_base > 0)
            .map((s) => ({
              name: name(s.member_id).split(" ")[0],
              color: (byId.get(s.member_id)?.profile?.avatar_color ?? "lilac") as Pastel,
              value: s.amount_base,
            }))}
        />
        <ul className="mt-4 space-y-2">
          {e.splits.map((s) => (
            <PersonRow
              key={s.member_id}
              member={byId.get(s.member_id)}
              name={name(s.member_id)}
              amount={s.amount_base}
              currency={group.base_currency}
              hint={rawLabel(s.raw_value)}
            />
          ))}
        </ul>
      </section>

      {e.note && (
        <section className="mt-6">
          <h3 className="micro mb-2 text-ink-faded">Note</h3>
          <p className="whitespace-pre-wrap text-[15px] font-medium text-ink/80">{e.note}</p>
        </section>
      )}

      <ReactionsRow type="expense" id={e.id} />

      {reason && (
        <p className="mt-6 flex items-start gap-2 rounded-2xl bg-ink/5 px-4 py-3 text-[13px] font-medium text-ink/70">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          {reason}
        </p>
      )}

      {canChange &&
        (confirming ? (
          <div className="mt-8 space-y-3">
            <p className="text-center text-[14px] font-medium text-ink/70">Delete this expense? You can undo for 10 seconds.</p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <button
                type="button"
                onClick={() => onDelete(e)}
                className="h-12 flex-1 rounded-full bg-owe text-[15px] font-semibold text-on-pastel"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" strokeWidth={2.25} />
              Delete
            </Button>
            <Button onClick={() => onEdit(e)}>
              <Pencil className="size-4" strokeWidth={2.25} />
              Edit
            </Button>
          </div>
        ))}

      <CommentThread type="expense" id={e.id} />
    </div>
  );
}

function rateLabel(rate: number | string): string {
  const scaled = parseRate(String(rate));
  return scaled ? rateToString(scaled) : String(rate);
}

function PersonRow({
  member,
  name,
  amount,
  currency,
  hint,
}: {
  member: MemberWithProfile | undefined;
  name: string;
  amount: number;
  currency: GroupWithMembers["base_currency"];
  hint?: string | null;
}) {
  return (
    <li className="flex items-center gap-3">
      {member ? <Avatar {...memberAvatar(member)} size="sm" /> : <Avatar name={name} size="sm" ghost />}
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
        {name}
        {member?.left_at && <span className="text-ink/40"> · left</span>}
        {hint && <span className="ml-2 text-[13px] font-medium text-ink/50">{hint}</span>}
      </span>
      <Amount amount={amount} currency={currency} size="sm" />
    </li>
  );
}

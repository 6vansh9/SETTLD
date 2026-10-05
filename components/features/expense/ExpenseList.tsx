"use client";

import { NewDot } from "@/components/features/social/GroupSocial";
import { SettlementCard } from "@/components/features/settle/SettlementCard";
import { Amount } from "@/components/ui";
import { myPositionOnExpense } from "@/lib/balances";
import { CATEGORY_META, isCategory } from "@/lib/categories";
import { localDate } from "@/lib/expense-form";
import type { ExpenseWithLines } from "@/lib/expenses-data";
import { microDay } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups-data";
import { pastelVar } from "@/lib/pastels";
import type { Settlement } from "@/lib/supabase/types";

type Item =
  | { kind: "expense"; day: string; at: string; expense: ExpenseWithLines }
  | { kind: "settlement"; day: string; at: string; settlement: Settlement };

/** Expenses tab: expenses and payments, grouped by date. Expense cards are tinted with the group color. */
export function ExpenseList({
  expenses,
  settlements = [],
  group,
  myMemberId,
  myUserId,
  onOpen,
  onOpenSettlement,
  onConfirm,
  onDispute,
  busySettlementId,
}: {
  expenses: ExpenseWithLines[];
  settlements?: Settlement[];
  group: GroupWithMembers;
  myMemberId: string | undefined;
  myUserId: string;
  onOpen: (expense: ExpenseWithLines) => void;
  onOpenSettlement: (s: Settlement) => void;
  onConfirm: (s: Settlement) => void;
  onDispute: (s: Settlement) => void;
  busySettlementId?: string | null;
}) {
  const names = new Map(group.members.map((m) => [m.id, m.id === myMemberId ? "You" : m.display_name.split(" ")[0]]));
  const items: Item[] = [
    ...expenses.map((e) => ({ kind: "expense" as const, day: e.date, at: e.created_at, expense: e })),
    // Payments have no calendar date of their own: use the local day they were recorded.
    ...settlements.map((s) => ({ kind: "settlement" as const, day: localDate(new Date(s.created_at)), at: s.created_at, settlement: s })),
  ].sort((a, b) => b.day.localeCompare(a.day) || b.at.localeCompare(a.at));

  const days: { day: string; items: Item[] }[] = [];
  for (const item of items) {
    const last = days[days.length - 1];
    if (last?.day === item.day) last.items.push(item);
    else days.push({ day: item.day, items: [item] });
  }

  return (
    <div className="space-y-6">
      {days.map(({ day, items }) => (
        <section key={day} aria-label={microDay(day)}>
          <h3 className="micro mb-2 text-ink-faded">{microDay(day)}</h3>
          <ul className="space-y-2">
            {items.map((item) =>
              item.kind === "expense" ? (
                <li key={item.expense.id}>
                  <ExpenseRow expense={item.expense} group={group} myMemberId={myMemberId} names={names} onOpen={() => onOpen(item.expense)} />
                </li>
              ) : (
                <li key={item.settlement.id}>
                  <SettlementCard
                    settlement={item.settlement}
                    group={group}
                    myUserId={myUserId}
                    onOpen={() => onOpenSettlement(item.settlement)}
                    onConfirm={() => onConfirm(item.settlement)}
                    onDispute={() => onDispute(item.settlement)}
                    busy={busySettlementId === item.settlement.id}
                  />
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ExpenseRow({
  expense: e,
  group,
  myMemberId,
  names,
  onOpen,
}: {
  expense: ExpenseWithLines;
  group: GroupWithMembers;
  myMemberId: string | undefined;
  names: Map<string, string>;
  onOpen: () => void;
}) {
  const { Icon, label } = CATEGORY_META[isCategory(e.category) ? e.category : "other"];
  const pos = myPositionOnExpense(e, myMemberId);
  const payer = e.payers.length === 1 ? names.get(e.payers[0].member_id) ?? "Someone" : `${e.payers.length} people`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[20px] border-[1.5px] border-ink/[0.08] p-3 text-left transition-transform active:scale-[0.99]"
      // A light wash of the group color over the surface: tinted in both themes, text stays readable.
      style={{ backgroundColor: `color-mix(in srgb, ${pastelVar(group.color)} 22%, rgb(var(--surface-rgb)))` }}
    >
      <span
        aria-label={label}
        role="img"
        className="flex size-11 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-on-pastel/[0.08] text-on-pastel"
        style={{ backgroundColor: pastelVar(group.color) }}
      >
        <Icon className="size-5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-[15px] font-semibold">{e.title}</span>
          <NewDot type="expense" id={e.id} />
        </span>
        <span className="mt-1 flex items-baseline gap-1 text-[12px] font-medium text-ink/60">
          {payer} paid <Amount amount={e.amount} currency={e.currency} size="sm" className="text-[15px] text-ink/70" />
          {e.currency !== group.base_currency && (
            // Foreign expense: show what it counts as in the group's currency too, e.g. "$40 (₹3,340)".
            <span className="flex items-baseline">
              (<Amount amount={e.amount_base} currency={group.base_currency} size="sm" className="text-[15px] text-ink/50" />)
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="micro text-ink-faded">
          {!pos.involved ? "Not involved" : pos.net > 0 ? "You lent" : pos.net < 0 ? "You owe" : "Your share"}
        </span>
        {pos.involved && pos.net !== 0 && (
          <Amount amount={Math.abs(pos.net)} currency={group.base_currency} size="sm" sign={pos.net > 0 ? "owed" : "owe"} className="mt-1 text-[24px]" />
        )}
      </span>
    </button>
  );
}

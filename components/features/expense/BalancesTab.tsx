"use client";

import { ArrowRight } from "lucide-react";
import { Amount, AnimatedAmount, Avatar } from "@/components/ui";
import { memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import type { Transfer } from "@/lib/simplify";
import type { GroupBalance } from "@/lib/supabase/types";
import { canPayViaUpi } from "@/lib/upi";

/** Balances tab: everyone's net, then who pays whom (simplified, or raw when simplify is off). */
export function BalancesTab({
  group,
  balances,
  plan,
  planError,
  myUserId,
  onSettle,
}: {
  group: GroupWithMembers;
  balances: GroupBalance[];
  /** Who pays whom (settlementPlan in GroupScreen): simplified, or raw debts net of settlements. */
  plan: Transfer[];
  planError: boolean;
  myUserId: string;
  onSettle: (t: Transfer) => void;
}) {
  const byId = new Map(group.members.map((m) => [m.id, m]));
  const label = (id: string) => {
    const m = byId.get(id);
    return m ? (m.user_id === myUserId ? "You" : m.display_name.split(" ")[0]) : "Someone";
  };

  // Everyone still in the group, plus anyone who left with a balance (shouldn't happen, but never hide money).
  const rows = balances
    .filter((b) => {
      const m = byId.get(b.member_id);
      return m && (!m.left_at || b.net !== 0);
    })
    .sort((a, b) => b.net - a.net);

  const transfers = plan;
  const myId = group.members.find((m) => m.user_id === myUserId && !m.left_at)?.id;

  return (
    <div className="space-y-8">
      <section aria-labelledby="nets-heading">
        <h3 id="nets-heading" className="micro mb-2 text-ink-faded">
          Everyone&apos;s balance
        </h3>
        <ul className="divide-y-[1.5px] divide-ink/[0.06] rounded-card border-[1.5px] border-ink/[0.08] bg-surface px-4">
          {rows.map((b) => {
            const m = byId.get(b.member_id)!;
            return (
              <li key={b.member_id} className="flex min-h-16 items-center gap-3 py-2">
                <Avatar {...memberAvatar(m)} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {label(b.member_id)}
                    {m.left_at && <span className="text-ink/40"> · left</span>}
                  </span>
                  <span className="micro mt-1 block text-ink-faded">
                    {b.net > 0 ? "Gets back" : b.net < 0 ? "Owes" : "Settled up"}
                  </span>
                </span>
                <AnimatedAmount
                  amount={Math.abs(b.net)}
                  currency={group.base_currency}
                  size="md"
                  sign={b.net > 0 ? "owed" : b.net < 0 ? "owe" : undefined}
                  className={b.net === 0 ? "opacity-40" : undefined}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="plan-heading">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 id="plan-heading" className="micro text-ink-faded">
            Who pays whom
          </h3>
          <span className="micro text-ink-faded">{group.simplify ? "Simplified" : "Every debt"}</span>
        </div>
        {planError ? (
          <p className="text-[14px] font-medium text-owe-ink">Balances don&apos;t add up. Reload the page and try again.</p>
        ) : transfers.length === 0 ? (
          <p className="rounded-card border-[1.5px] border-dashed border-ink/15 px-4 py-6 text-center text-[15px] font-medium text-ink/60">
            Nobody owes anybody. 🎉
          </p>
        ) : (
          <ul className="space-y-2">
            {transfers.map((t) => {
              const from = byId.get(t.from);
              const to = byId.get(t.to);
              return (
                <li key={`${t.from}-${t.to}`} className="rounded-card border-[1.5px] border-ink/[0.08] bg-surface p-4">
                  <div className="flex items-center gap-2">
                    {from && <Avatar {...memberAvatar(from)} size="sm" />}
                    <ArrowRight className="size-4 text-ink/40" aria-hidden />
                    {to && <Avatar {...memberAvatar(to)} size="sm" />}
                    <span className="ml-1 min-w-0 flex-1 truncate text-[14px] font-semibold">
                      {label(t.from)} {label(t.from) === "You" ? "pay" : "pays"} {label(t.to)}
                    </span>
                    <Amount amount={t.amount} currency={group.base_currency} size="md" />
                  </div>
                  {myId && (t.from === myId || t.to === myId) && !group.archived_at && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {t.from === myId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onSettle(t)}
                            disabled={!canPayViaUpi(group.base_currency, to?.profile?.upi_id)}
                            title={canPayViaUpi(group.base_currency, to?.profile?.upi_id) ? undefined : "UPI needs an INR group and their UPI ID"}
                            className="h-10 rounded-full bg-coral text-[13px] font-semibold text-on-pastel disabled:opacity-30"
                          >
                            Pay via UPI
                          </button>
                          <button
                            type="button"
                            onClick={() => onSettle(t)}
                            className="h-10 rounded-full border-[1.5px] border-ink/15 text-[13px] font-semibold text-ink"
                          >
                            Mark paid
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSettle(t)}
                          className="col-span-2 h-10 rounded-full border-[1.5px] border-ink/15 text-[13px] font-semibold text-ink"
                        >
                          Mark as received
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

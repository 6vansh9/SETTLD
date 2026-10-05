"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Activity, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Amount, AnimatedAmount, Avatar, Button, CardStack, PrivacyToggle, Title } from "@/components/ui";
import { myNetInGroup, oweOwedTotals } from "@/lib/balances";
import { partitionGroups } from "@/lib/groups";
import { formatAmount } from "@/lib/money";
import type { GroupWithMembers } from "@/lib/groups-data";
import { fade, spring } from "@/lib/motion";
import { useAllBalances } from "@/lib/queries/expenses";
import { useGroups } from "@/lib/queries/groups";
import { useMyActivityRealtime } from "@/lib/realtime/useMyActivityRealtime";
import { BottomTabBar } from "@/components/features/nav/BottomTabBar";
import { useProfile } from "@/lib/queries/profile";
import type { GroupBalance, Profile } from "@/lib/supabase/types";
import { CreateGroupSheet } from "./CreateGroupSheet";
import { GroupCard } from "./GroupCard";

export function GroupsHome({
  initialGroups,
  initialBalances,
  initialProfile,
  rates = {},
}: {
  initialGroups: GroupWithMembers[];
  initialBalances: GroupBalance[];
  initialProfile: Profile;
  /** "USD:INR" → "96.32", into my default currency (server-fetched, cached 6 h). */
  rates?: Record<string, string>;
}) {
  const { data: groups = initialGroups } = useGroups(initialGroups);
  const { data: balances = initialBalances } = useAllBalances(initialBalances);
  const { data: profile = initialProfile } = useProfile(initialProfile);
  const me = profile ?? initialProfile;
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const reduce = useReducedMotion();
  // Live: any activity in any of my groups refreshes cards and the overall total.
  useMyActivityRealtime(
    groups.map((g) => g.id),
    me.id,
  );
  const { active, archived } = partitionGroups(groups);
  const totals = oweOwedTotals(groups, balances, me.id, me.default_currency, rates);
  const netIn = (g: GroupWithMembers) => myNetInGroup(g, balances, me.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pb-[calc(112px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span className="micro">Hey, {me.name.split(" ")[0]}</span>
        <div className="flex items-center gap-2">
          <Link
            href="/activity"
            aria-label="Activity across all groups"
            className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink/[0.08] bg-surface"
          >
            <Activity className="size-5" strokeWidth={2.25} />
          </Link>
          <PrivacyToggle />
          <Link href="/me" aria-label="Your profile" className="rounded-full">
            <Avatar name={me.name} color={me.avatar_color} size="lg" className="size-11" />
          </Link>
        </div>
      </header>

      <div className="mt-8 flex items-end justify-between gap-4">
        <Title line1="SETTLD" line2="GROUPS" size="xl" />
      </div>

      {groups.length === 0 ? (
        // Empty state: one huge faded word, one CTA (PRD › Screens)
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <p aria-hidden className="font-display text-[120px] uppercase leading-[0.85] text-ink-faded">
            Nothing
            <br />
            yet
          </p>
          <p className="mt-6 max-w-[260px] text-[15px] font-medium text-ink/60">
            Start a group for a trip, your flat or the dinner crew.
          </p>
          <Button className="mt-6" onClick={() => setCreating(true)}>
            <Plus className="size-5" strokeWidth={2.5} />
            New group
          </Button>
        </div>
      ) : (
        <>
          {/* What I owe and what I'm owed, side by side (each group converted separately). */}
          <section aria-label="Your balances" className="mt-6">
            <div className="grid grid-cols-2 gap-3">
              <Figure label="You owe" amount={totals.owe} currency={me.default_currency} approx={totals.approx} tone="owe" />
              <Figure label="You're owed" amount={totals.owed} currency={me.default_currency} approx={totals.approx} tone="owed" />
            </div>
            <p
              className={`mt-3 flex flex-wrap items-baseline gap-1.5 text-[14px] font-semibold ${
                totals.net > 0 ? "text-owed-ink" : totals.net < 0 ? "text-owe-ink" : "text-ink/50"
              }`}
            >
              {totals.net === 0 ? (
                "All settled up"
              ) : (
                <>
                  {totals.net > 0 ? "Overall you're owed" : "Overall you owe"}
                  {totals.approx && <span aria-hidden>≈</span>}
                  <AnimatedAmount amount={Math.abs(totals.net)} currency={me.default_currency} size="sm" className="text-[18px]" />
                  {totals.approx && <span className="text-[12px] font-medium text-ink/50">· approx.</span>}
                </>
              )}
            </p>
            {totals.approx && <p className="mt-1 text-[12px] font-medium text-ink/50">Other currencies converted at today&apos;s rates.</p>}
            {/* Only if no rate exists at all (API down and nothing cached): kept separate, exact. */}
            {totals.unconverted.map((u) => (
              <p key={u.currency} className="mt-1 flex flex-wrap items-baseline gap-1.5 text-[12px] font-semibold text-ink/60">
                Not converted:
                {u.owe > 0 && (
                  <>
                    you owe <Amount amount={u.owe} currency={u.currency} size="sm" sign="owe" className="text-[15px]" />
                  </>
                )}
                {u.owed > 0 && (
                  <>
                    you&apos;re owed <Amount amount={u.owed} currency={u.currency} size="sm" sign="owed" className="text-[15px]" />
                  </>
                )}
              </p>
            ))}
          </section>

          <Button fullWidth className="mt-6" onClick={() => setCreating(true)}>
            <Plus className="size-5" strokeWidth={2.5} />
            New group
          </Button>

          {active.length > 0 && (
            <CardStack className="mt-6">
              {active.map((g) => (
                <GroupCard key={g.id} group={g} href={`/g/${g.id}`} myNet={netIn(g)} />
              ))}
            </CardStack>
          )}

          {archived.length > 0 && (
            <section className="mt-10">
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                aria-expanded={showArchived}
                className="flex w-full items-center justify-between border-t-[1.5px] border-ink/10 pt-4"
              >
                <span className="font-display-alt text-[28px] uppercase leading-none text-ink-faded">
                  Archived <span className="font-num">{archived.length}</span>
                </span>
                <motion.span animate={{ rotate: showArchived ? 180 : 0 }} transition={reduce ? fade : spring}>
                  <ChevronDown className="size-5 text-ink/50" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {showArchived && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={reduce ? fade : spring}
                    className="overflow-hidden"
                  >
                    <CardStack className="pt-4 opacity-70 grayscale-[35%]">
                      {archived.map((g) => (
                        <GroupCard key={g.id} group={g} href={`/g/${g.id}`} myNet={netIn(g)} />
                      ))}
                    </CardStack>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )}
        </>
      )}

      <BottomTabBar />
      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} defaultCurrency={me.default_currency} />
    </main>
  );
}

/** One of Home's two big figures. Red/green use the AA-safe text tokens (see lib/contrast.test.ts). */
function Figure({
  label,
  amount,
  currency,
  approx,
  tone,
}: {
  label: string;
  amount: number;
  currency: Profile["default_currency"];
  approx: boolean;
  tone: "owe" | "owed";
}) {
  const ink = tone === "owe" ? "text-owe-ink" : "text-owed-ink";
  // Two figures share a 390px row: step down a size once the amount gets long (₹5,052.80).
  const len = formatAmount(amount, currency).length;
  const size = len > 11 ? "sm" : len > 8 ? "md" : "lg";
  return (
    <div className="rounded-card border-[1.5px] border-ink/[0.08] bg-surface p-4">
      <p className={`micro ${amount === 0 ? "text-ink-faded" : ink}`}>
        {label}
        {approx && amount > 0 && <span title="Approximate: converted at today's rates"> ≈</span>}
      </p>
      <span className="mt-2 flex min-w-0 items-baseline overflow-hidden">
        <AnimatedAmount
          amount={amount}
          currency={currency}
          size={size}
          sign={amount === 0 ? undefined : tone}
          className={amount === 0 ? "opacity-40" : undefined}
        />
      </span>
    </div>
  );
}

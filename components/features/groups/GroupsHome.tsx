"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Amount, Avatar, Button, CardStack, PrivacyToggle, Title } from "@/components/ui";
import { convertedTotal, myNetInGroup, overallTotals } from "@/lib/balances";
import { partitionGroups } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups-data";
import { fade, spring } from "@/lib/motion";
import { useAllBalances } from "@/lib/queries/expenses";
import { useGroups } from "@/lib/queries/groups";
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
  const { active, archived } = partitionGroups(groups);
  const overall = convertedTotal(overallTotals(groups, balances, me.id, me.default_currency), me.default_currency, rates);
  const netIn = (g: GroupWithMembers) => myNetInGroup(g, balances, me.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <span className="micro">Hey, {me.name.split(" ")[0]}</span>
        <div className="flex items-center gap-2">
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
          <div className="mt-6">
            <p className="micro text-ink-faded">
              Overall · {overall.total > 0 ? "you're owed" : overall.total < 0 ? "you owe" : "all settled"}
              {overall.approx && " · approx."}
            </p>
            <span className="mt-2 flex items-baseline gap-2">
              {overall.approx && (
                <span aria-hidden className="font-num text-[40px] leading-none text-ink-faded">
                  ≈
                </span>
              )}
              <Amount
                amount={Math.abs(overall.total)}
                currency={me.default_currency}
                size="xl"
                sign={overall.total > 0 ? "owed" : overall.total < 0 ? "owe" : undefined}
              />
            </span>
            {overall.approx && (
              <p className="mt-1 text-[12px] font-medium text-ink/50">Other currencies converted at today&apos;s rates.</p>
            )}
            {/* Only if no rate exists at all (API down and nothing cached): kept separate, exact. */}
            {overall.unconverted.map((o) => (
              <p key={o.currency} className="mt-2 flex items-baseline gap-1.5 text-[13px] font-semibold text-ink/60">
                <span>{o.net > 0 ? "+ owed" : "+ you owe"}</span>
                <Amount amount={Math.abs(o.net)} currency={o.currency} size="sm" sign={o.net > 0 ? "owed" : "owe"} />
                <span>in {o.currency} groups</span>
              </p>
            ))}
          </div>

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

      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} defaultCurrency={me.default_currency} />
    </main>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Amount } from "@/components/ui";
import type { CurrencyCode } from "@/lib/money";
import { spring } from "@/lib/motion";
import { pastelVar, type Pastel } from "@/lib/pastels";

/**
 * One-time card after taking a ghost's spot: who added me, what's been spent, where I stand.
 * Everything already split with the ghost is mine now.
 */
export function WelcomeCard({
  groupName,
  color,
  addedBy,
  spent,
  myNet,
  currency,
  onSeeExpenses,
  onClose,
}: {
  groupName: string;
  color: Pastel;
  addedBy: string | null;
  spent: number;
  myNet: number;
  currency: CurrencyCode;
  onSeeExpenses: () => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.2 } : spring}
      aria-labelledby="welcome-title"
      className="relative mx-5 mt-4 rounded-card border-[1.5px] border-ink/[0.08] bg-surface p-5"
    >
      <button type="button" onClick={onClose} aria-label="Dismiss" className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full text-ink/60 hover:bg-ink/5">
        <X className="size-4" />
      </button>
      <p className="micro text-ink-faded">You&apos;re in</p>
      <h2 id="welcome-title" className="mt-2 pr-8 font-display text-[36px] uppercase leading-[0.9]">
        Welcome to {groupName}
      </h2>
      <p className="mt-3 text-[15px] font-medium text-ink/70">
        {addedBy ? `${addedBy.split(" ")[0]} added you, so ` : ""}everything already split with your spot is yours now.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3 text-on-pastel" style={{ backgroundColor: pastelVar(color) }}>
          <p className="micro opacity-75">Spent so far</p>
          <Amount amount={spent} currency={currency} size="md" className="mt-1" />
        </div>
        <div className="rounded-2xl border-[1.5px] border-ink/[0.08] p-3">
          <p className="micro text-ink-faded">{myNet < 0 ? "You owe" : myNet > 0 ? "You're owed" : "Your balance"}</p>
          {myNet === 0 ? (
            <p className="mt-1 text-[18px] font-semibold">All square</p>
          ) : (
            <Amount amount={Math.abs(myNet)} currency={currency} size="md" sign={myNet < 0 ? "owe" : "owed"} className="mt-1" />
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onSeeExpenses}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-full bg-coral font-display-alt text-[18px] uppercase tracking-wide text-on-pastel"
      >
        See the expenses
      </button>
    </motion.section>
  );
}

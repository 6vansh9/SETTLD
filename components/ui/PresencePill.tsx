"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fade, spring } from "@/lib/motion";
import type { CurrencyCode } from "@/lib/money";
import { Amount } from "./Amount";

export interface PillItem {
  key: string;
  text: string;
  amount?: { value: number; currency: CurrencyCode } | null;
  /** Someone is doing it right now (shows a pulsing dot; stays until they stop). */
  live?: boolean;
  onTap?: () => void;
}

/**
 * Black pill floating at the top, like the iPhone Dynamic Island (PRD › Presence pill).
 * Same black in light and dark mode. Springs open; fades under reduced motion. Enter-only: each
 * item remounts by key, with no exit animation that could hold the old pill on screen.
 */
export function PresencePill({ item, onTap }: { item: PillItem | null; onTap?: (item: PillItem) => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(8px+env(safe-area-inset-top))] z-[65] flex justify-center px-5">
      {item && (
          <motion.button
            key={item.key}
            type="button"
            onClick={() => onTap?.(item)}
            aria-live="polite"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: -14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={reduce ? fade : spring}
            className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-[#0E0E0E] py-2.5 pl-3.5 pr-4 text-[#F4F1EC] shadow-[0_0_0_1px_rgba(244,241,236,0.08)]"
          >
            {item.live && (
              <span className="relative flex size-2.5 shrink-0" aria-hidden>
                {!reduce && <span className="absolute inset-0 animate-ping rounded-full bg-coral opacity-75" />}
                <span className="relative size-2.5 rounded-full bg-coral" />
              </span>
            )}
            <span className="truncate text-[13px] font-semibold">{item.text}</span>
            {item.amount && <Amount amount={item.amount.value} currency={item.amount.currency} size="sm" className="text-[18px]" />}
          </motion.button>
      )}
    </div>
  );
}

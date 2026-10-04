"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Delete } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { CURRENCIES, fromMinor, toMinor, type CurrencyCode } from "@/lib/money";
import { Amount } from "./Amount";
import { Button } from "./Button";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;
type Key = (typeof KEYS)[number];

/** Max digits before the decimal point (₹99,99,99,999 · $9,999,999,999). */
const MAX_WHOLE_DIGITS = 10;

/** Apply one key press to the typed string. Exported for tests. */
export function pressKey(draft: string, key: Key, decimals: number): string {
  if (key === "back") return draft.slice(0, -1);
  const [whole, fraction] = draft.split(".");
  if (key === ".") {
    if (decimals === 0 || fraction !== undefined) return draft;
    return (draft || "0") + ".";
  }
  if (fraction !== undefined) {
    return fraction.length >= decimals ? draft : draft + key;
  }
  if (whole === "0") return key; // replace a leading zero
  if (whole.length >= MAX_WHOLE_DIGITS) return draft;
  return draft + key;
}

export function draftToMinor(draft: string, currency: CurrencyCode): bigint {
  if (draft === "" || draft === ".") return BigInt(0);
  return toMinor(draft, currency);
}

export interface NumpadProps {
  currency: CurrencyCode;
  /** Initial value in minor units. */
  initialMinor?: bigint;
  /** Called on every key press with the current value in minor units. */
  onChange?: (minor: bigint) => void;
  /** Called when the user confirms. */
  onDone?: (minor: bigint) => void;
  doneLabel?: string;
  /** Micro label above the amount, e.g. "DINNER · PAID BY YOU". */
  label?: string;
  className?: string;
}

/** Full-screen amount entry: amount in Jersey 10 at 96px, keys 0–9, ".", backspace. */
export function Numpad({
  currency,
  initialMinor,
  onChange,
  onDone,
  doneLabel = "Done",
  label,
  className,
}: NumpadProps) {
  const { decimals } = CURRENCIES[currency];
  const [draft, setDraft] = useState(() =>
    initialMinor && initialMinor > BigInt(0)
      ? fromMinor(initialMinor, currency).replace(/\.?0+$/, "")
      : "",
  );
  const minor = draftToMinor(draft, currency);
  const reduce = useReducedMotion();

  const press = useCallback(
    (key: Key) => {
      const next = pressKey(draft, key, decimals);
      if (next === draft) return;
      setDraft(next);
      onChange?.(draftToMinor(next, currency));
    },
    [draft, currency, decimals, onChange],
  );

  // Hardware keyboard support on desktop.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key as Key);
      else if (e.key === "." || e.key === ",") press(".");
      else if (e.key === "Backspace") press("back");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5">
        {label && <p className="micro text-ink-faded">{label}</p>}
        <motion.div
          key={draft.length}
          initial={reduce ? false : { scale: 0.96 }}
          animate={{ scale: 1 }}
          transition={spring}
          aria-live="polite"
          className="max-w-full"
        >
          <Amount
            amount={minor}
            currency={currency}
            draft={draft || "0"}
            // 96px by default; step down so long amounts still fit a 390px screen
            size={draft.length > 10 ? "lg" : draft.length > 7 ? "xl" : "hero"}
            unblurrable
            className={cn(draft === "" && "opacity-35")}
          />
        </motion.div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 pb-3">
        {KEYS.map((key) => (
          <motion.button
            key={key}
            type="button"
            onClick={() => press(key)}
            whileTap={reduce ? undefined : { scale: 0.92 }}
            transition={spring}
            aria-label={key === "back" ? "Backspace" : key === "." ? "Decimal point" : key}
            disabled={key === "." && decimals === 0}
            className="flex h-16 items-center justify-center rounded-[20px] font-num text-[36px] leading-none text-ink transition-colors active:bg-ink/10 disabled:opacity-30"
          >
            {key === "back" ? <Delete className="size-7" strokeWidth={2} /> : key}
          </motion.button>
        ))}
      </div>

      {onDone && (
        <div className="px-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <Button fullWidth disabled={minor <= BigInt(0)} onClick={() => onDone(minor)}>
            {doneLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

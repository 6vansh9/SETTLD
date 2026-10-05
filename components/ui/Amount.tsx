"use client";

import { useEffect, useRef, useState } from "react";
import { usePrivacy } from "@/components/providers/PrivacyProvider";
import { cn } from "@/lib/cn";
import {
  CURRENCIES,
  formatAmount,
  formatParts,
  groupDigits,
  type CurrencyCode,
  type Minor,
} from "@/lib/money";

export type AmountSize = "sm" | "md" | "lg" | "xl" | "hero";

const sizeClass: Record<AmountSize, string> = {
  sm: "text-[20px]",
  md: "text-[32px]",
  lg: "text-[48px]",
  xl: "text-[64px]",
  hero: "text-[96px]",
};

const PEEK_MS = 2000;

export interface AmountProps {
  /** Integer minor units (paise, cents). */
  amount: Minor;
  currency: CurrencyCode;
  size?: AmountSize;
  /** Color the amount red (owe) or green (owed). */
  sign?: "owe" | "owed";
  /**
   * Numpad entry: render a typed decimal string ("1240.5") exactly as typed
   * instead of the formatted amount. `amount` is still used for the aria-label.
   */
  draft?: string;
  /** Opt out of the global privacy blur (e.g. inside the numpad). */
  unblurrable?: boolean;
  className?: string;
}

/**
 * Every money amount in the UI. Currency symbol and decimals at 70% opacity (AA),
 * whole number full strength, Jersey 10, Indian grouping for INR.
 */
export function Amount({
  amount,
  currency,
  size = "md",
  sign,
  draft,
  unblurrable = false,
  className,
}: AmountProps) {
  const { blurred } = usePrivacy();
  const [peeking, setPeeking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!blurred) setPeeking(false);
  }, [blurred]);

  const parts = draft !== undefined ? draftParts(draft, currency) : formatParts(amount, currency);
  const hidden = blurred && !peeking && !unblurrable;
  const label = formatAmount(amount, currency);

  const peek = () => {
    setPeeking(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPeeking(false), PEEK_MS);
  };

  const content = (
    <>
      <span className="opacity-[var(--amount-faded,0.7)]">
        {parts.negative ? "−" : ""}
        {parts.symbol}
      </span>
      <span>{parts.whole}</span>
      {parts.fraction && <span className="opacity-[var(--amount-faded,0.7)]">{parts.fraction}</span>}
    </>
  );

  const classes = cn(
    "inline-flex items-baseline whitespace-nowrap font-num leading-[0.85] tabular",
    sizeClass[size],
    // Red/green text is only just AA: its symbol and decimals stay full strength.
    sign === "owe" && "text-owe-ink [--amount-faded:1]",
    sign === "owed" && "text-owed-ink [--amount-faded:1]",
    "transition-[filter] duration-200",
    hidden && "select-none [filter:blur(8px)]",
    className,
  );

  if (blurred && !unblurrable) {
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={hidden ? "Hidden amount, tap to reveal" : label}
        onClick={peek}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            peek();
          }
        }}
        className={cn(classes, "cursor-pointer")}
      >
        <span aria-hidden className="contents">
          {content}
        </span>
      </span>
    );
  }

  return (
    <span className={classes} aria-label={label} role="img">
      <span aria-hidden className="contents">
        {content}
      </span>
    </span>
  );
}

function draftParts(draft: string, currency: CurrencyCode) {
  const meta = CURRENCIES[currency];
  const [whole = "", fraction] = draft.split(".");
  return {
    negative: false,
    symbol: meta.symbol,
    whole: groupDigits(whole.replace(/^0+(?=\d)/, "") || "0", meta.grouping),
    fraction: fraction === undefined ? "" : `.${fraction}`,
  };
}

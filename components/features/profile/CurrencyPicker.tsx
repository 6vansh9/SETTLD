"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/money";

/** Default currency list: symbol in Jersey 10, name, check on the selected row. */
export function CurrencyPicker({
  value,
  onChange,
}: {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Default currency" className="flex flex-col gap-2">
      {CURRENCY_CODES.map((code) => {
        const meta = CURRENCIES[code];
        const active = value === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(code)}
            className={cn(
              "flex h-16 items-center gap-4 rounded-[20px] border-[1.5px] px-4 text-left transition-colors",
              active ? "border-ink bg-ink text-bg" : "border-ink/[0.08] bg-surface text-ink",
            )}
          >
            <span className="w-12 font-num text-[32px] leading-none">{meta.symbol}</span>
            <span className="flex-1">
              <span className="block text-[15px] font-semibold">{meta.name}</span>
              <span className={cn("micro mt-1 block", active ? "opacity-60" : "text-ink-faded")}>
                {code}
              </span>
            </span>
            {active && <Check className="size-5" strokeWidth={2.5} />}
          </button>
        );
      })}
    </div>
  );
}

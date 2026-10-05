"use client";

import { ChevronDown } from "lucide-react";
import { useId, useMemo } from "react";
import { cn } from "@/lib/cn";
import { countryOptions, toE164, type CountryCode } from "@/lib/phone";

export interface PhoneValue {
  country: CountryCode;
  national: string;
}

/** Country picker (+91 by default) + number. The parent gets E.164 via toE164(value). */
export function PhoneField({
  label,
  value,
  onChange,
  error,
  hint,
  autoFocus,
  className,
}: {
  label: string;
  value: PhoneValue;
  onChange: (v: PhoneValue) => void;
  error?: string | null;
  hint?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const id = useId();
  const countries = useMemo(() => countryOptions(), []);
  const current = countries.find((c) => c.code === value.country) ?? countries[0];
  return (
    <div className={className}>
      <label htmlFor={`${id}-num`} className="micro text-ink-faded">
        {label}
      </label>
      <div className={cn("mt-2 flex h-14 overflow-hidden rounded-2xl border-[1.5px] bg-surface focus-within:border-ink", error ? "border-owe" : "border-ink/15")}>
        <div className="relative flex shrink-0 items-center border-r-[1.5px] border-ink/10 pl-3 pr-7">
          <span aria-hidden className="text-[18px] leading-none">
            {current.flag}
          </span>
          <span aria-hidden className="ml-1.5 text-[16px] font-semibold">
            {current.dial}
          </span>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-4 text-ink/40" />
          {/* Native select on top (invisible): the phone's own picker, searchable on iOS. */}
          <select
            aria-label="Country code"
            value={value.country}
            onChange={(e) => onChange({ ...value, country: e.target.value as CountryCode })}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name} ({c.dial})
              </option>
            ))}
          </select>
        </div>
        <input
          id={`${id}-num`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          placeholder={value.country === "IN" ? "98765 43210" : "Phone number"}
          value={value.national}
          onChange={(e) => onChange({ ...value, national: e.target.value })}
          aria-invalid={!!error}
          className="min-w-0 flex-1 bg-transparent px-3 text-[17px] font-medium outline-none"
        />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-owe-ink">
          {error}
        </p>
      ) : (
        hint && <p className="mt-2 text-[13px] font-medium text-ink/50">{hint}</p>
      )}
    </div>
  );
}

/** Validation message for a required/optional phone field, or null when fine. */
export function phoneError(v: PhoneValue, required: boolean): string | null {
  if (!v.national.trim()) return required ? "Add your number" : null;
  return toE164(v.national, v.country) ? null : "That doesn't look like a valid number for this country";
}

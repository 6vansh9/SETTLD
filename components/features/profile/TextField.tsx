"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string;
  /** Big Shoulders display-size input (onboarding). */
  large?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, large, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="micro block text-ink-faded">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={cn(
          "mt-2 w-full rounded-2xl border-[1.5px] border-ink/15 bg-surface px-4 text-ink placeholder:text-ink/25 focus:border-ink focus:outline-none",
          large
            ? "h-20 font-display-alt text-[36px] uppercase"
            : "h-14 text-[17px] font-medium",
          error && "border-owe focus:border-owe",
        )}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-[13px] font-medium text-owe-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-2 text-[13px] font-medium text-ink/50">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

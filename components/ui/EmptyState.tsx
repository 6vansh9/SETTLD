"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Designed empty state (PRD › Screens): a huge faded word pair, a short hint, exactly one CTA.
 * compact: for lists inside a screen or sheet.
 */
export function EmptyState({
  lines,
  hint,
  cta,
  compact = false,
  className,
}: {
  lines: [string, string];
  hint: string;
  cta?: { label: string; onClick: () => void; icon?: React.ReactNode } | { label: string; href: string; icon?: React.ReactNode };
  compact?: boolean;
  className?: string;
}) {
  const btn = "inline-flex h-14 items-center justify-center gap-2 rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel transition-transform active:scale-[0.97]";
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "py-4" : "py-10", className)}>
      <p aria-hidden className={cn("font-display uppercase leading-[0.85] text-ink-faded", compact ? "text-[64px]" : "text-[104px]")}>
        {lines[0]}
        <br />
        {lines[1]}
      </p>
      <h2 className="sr-only">{lines.join(" ")}</h2>
      <p className={cn("max-w-[270px] font-medium text-ink/60", compact ? "mt-4 text-[14px]" : "mt-6 text-[15px]")}>{hint}</p>
      {cta &&
        ("href" in cta ? (
          <Link href={cta.href} className={cn(btn, compact ? "mt-4" : "mt-6")}>
            {cta.icon}
            {cta.label}
          </Link>
        ) : (
          <button type="button" onClick={cta.onClick} className={cn(btn, compact ? "mt-4" : "mt-6")}>
            {cta.icon}
            {cta.label}
          </button>
        ))}
    </div>
  );
}

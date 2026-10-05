"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import { percentages } from "@/lib/money";
import { pastelVar, type Pastel } from "@/lib/pastels";

export interface SplitSegment {
  name: string;
  color: Pastel | string;
  /** Share in minor units (or any comparable integer weight). */
  value: number;
}

export interface SplitBarProps {
  segments: SplitSegment[];
  /** Hide the name/percentage row under the bar. */
  hideLabels?: boolean;
  className?: string;
}

/** Segmented horizontal bar of each person's share, with names and percentages underneath. */
export function SplitBar({ segments, hideLabels = false, className }: SplitBarProps) {
  const reduce = useReducedMotion();
  const pcts = percentages(segments.map((s) => s.value));
  const total = segments.reduce((sum, s) => sum + Math.abs(s.value), 0);

  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex h-5 w-full gap-[3px]"
        role="img"
        aria-label={segments.map((s, i) => `${s.name} ${pcts[i]}%`).join(", ")}
      >
        {segments.map((s) => {
          const share = total === 0 ? 100 / segments.length : (Math.abs(s.value) / total) * 100;
          return (
            <motion.div
              key={s.name}
              className="h-full min-w-[6px] rounded-full border-[1.5px] border-on-pastel/[0.08]"
              style={{ backgroundColor: pastelVar(s.color) }}
              initial={reduce ? false : { flexGrow: 0 }}
              animate={{ flexGrow: share, flexBasis: 0 }}
              transition={reduce ? fade : spring}
            />
          );
        })}
      </div>

      {!hideLabels && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {segments.map((s, i) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full border-[1.5px] border-on-pastel/[0.08]"
                style={{ backgroundColor: pastelVar(s.color) }}
              />
              <span className="micro">{s.name}</span>
              <span className="font-num text-[18px] leading-none opacity-75">{pcts[i]}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

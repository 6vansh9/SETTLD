"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

/** On/off toggle. `label` is the accessible name. */
export function Switch({ checked, onChange, label, disabled, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full p-1 transition-colors disabled:opacity-40",
        checked ? "bg-ink" : "bg-ink/15",
        className,
      )}
    >
      <motion.span
        layout
        transition={spring}
        className={cn("size-6 rounded-full bg-bg", checked && "ml-auto")}
      />
    </button>
  );
}

"use client";

import { motion } from "framer-motion";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { PASTELS, type Pastel } from "@/lib/pastels";

/** Pick an avatar pastel; each option previews the user's initials. */
export function ColorPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Pastel;
  onChange: (color: Pastel) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Avatar color" className="grid grid-cols-3 gap-4">
      {PASTELS.map((color) => {
        const active = value === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={color}
            onClick={() => onChange(color)}
            className="relative flex aspect-square items-center justify-center rounded-card"
          >
            {/* Per-option ring (no layoutId): shared-layout animations can block a parent's exit animation. */}
            <motion.span
              aria-hidden
              initial={false}
              animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.85 }}
              transition={spring}
              className="absolute inset-0 rounded-card border-[2.5px] border-ink"
            />
            <Avatar
              name={name || "?"}
              color={color}
              size="lg"
              className={cn("size-16 text-[20px] transition-transform", active && "scale-110")}
            />
          </button>
        );
      })}
    </div>
  );
}

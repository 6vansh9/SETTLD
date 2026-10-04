"use client";

import { motion } from "framer-motion";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeSetting } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

const OPTIONS: { value: ThemeSetting; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Light / dark / system segmented control, persisted in localStorage. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "inline-flex rounded-full border-[1.5px] border-ink/[0.08] bg-surface p-1",
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => setTheme(value)}
            className={cn(
              "relative flex h-9 w-10 items-center justify-center rounded-full transition-colors",
              active ? "text-bg" : "text-ink/60 hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId="theme-toggle-pill"
                transition={spring}
                className="absolute inset-0 rounded-full bg-ink"
              />
            )}
            <Icon className="relative size-4" strokeWidth={2.25} />
          </button>
        );
      })}
    </div>
  );
}

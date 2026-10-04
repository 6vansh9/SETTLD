"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "footer";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "h-14 rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel",
  secondary:
    "h-12 rounded-full border-[1.5px] border-ink/15 bg-surface px-6 text-[15px] font-semibold text-ink",
  ghost: "h-12 rounded-full px-5 text-[15px] font-semibold text-ink hover:bg-ink/5",
  // Full-width SETTLE UP block, pinned by the parent; clears the home indicator.
  footer:
    "w-full rounded-t-card bg-coral px-6 pt-6 pb-[calc(24px+env(safe-area-inset-bottom))] font-display-alt text-[36px] uppercase leading-none tracking-wide text-on-pastel",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", fullWidth, className, disabled, type = "button", ...rest },
  ref,
) {
  const reduce = useReducedMotion();

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      whileTap={disabled || reduce ? undefined : { scale: 0.97 }}
      transition={spring}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variantClass[variant],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    />
  );
});

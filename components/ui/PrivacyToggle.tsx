"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/components/providers/PrivacyProvider";
import { cn } from "@/lib/cn";

/** Header eye icon: blurs every <Amount /> in the app. */
export function PrivacyToggle({ className }: { className?: string }) {
  const { blurred, toggle } = usePrivacy();
  const Icon = blurred ? EyeOff : Eye;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={blurred}
      aria-label={blurred ? "Show amounts" : "Hide amounts"}
      className={cn(
        "flex size-11 items-center justify-center rounded-full border-[1.5px] border-ink/[0.08] bg-surface text-ink transition-colors",
        blurred && "bg-ink text-bg",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={2.25} />
    </button>
  );
}

"use client";

import { Activity, LayoutGrid, Plus, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCommandBar } from "@/components/features/command-bar/CommandBarProvider";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/groups", label: "Groups", Icon: LayoutGrid },
  { href: "/activity", label: "Activity", Icon: Activity },
  { href: null, label: "Add", Icon: Plus },
  { href: "/me", label: "You", Icon: User },
] as const;

/**
 * Bottom tab bar (PRD › Spacing and layout: Groups, Activity, + (command bar), Friends, You).
 * Friends is left out until it exists. The + opens the command bar.
 */
export function BottomTabBar() {
  const path = usePathname();
  const { open } = useCommandBar();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-app items-center justify-around border-t-[1.5px] border-ink/[0.06] bg-bg/90 px-2 pb-[calc(8px+env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      {TABS.map(({ href, label, Icon }) =>
        href ? (
          <Link
            key={label}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={cn("flex h-12 w-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", path === href ? "text-ink" : "text-ink/45")}
          >
            <Icon className="size-5" strokeWidth={2.25} />
            {label}
          </Link>
        ) : (
          <button
            key={label}
            type="button"
            onClick={() => open(null)}
            aria-label="Add an expense"
            className="flex size-14 items-center justify-center rounded-full bg-coral text-on-pastel"
          >
            <Icon className="size-7" strokeWidth={2.5} />
          </button>
        ),
      )}
    </nav>
  );
}

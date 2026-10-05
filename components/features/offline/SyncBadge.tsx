import { CloudOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SyncState } from "@/lib/offline/overlay";

/** On cards for writes still in the offline queue. */
export function SyncBadge({ state, className }: { state?: SyncState; className?: string }) {
  if (!state) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        state === "failed" ? "bg-owe text-on-pastel" : "bg-ink/10 text-ink/70",
        className,
      )}
    >
      <CloudOff className="size-3" aria-hidden />
      {state === "failed" ? "Couldn't sync" : "Waiting to sync"}
    </span>
  );
}

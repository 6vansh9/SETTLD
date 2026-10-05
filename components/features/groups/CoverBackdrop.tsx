import { cn } from "@/lib/cn";
import { textScrim } from "@/lib/images";

/**
 * A group's background photo in its real colors, filling the parent behind everything (no
 * overlay). Give the parent `relative isolate`. Readability comes from <CoverScrim> behind the
 * text block, not from darkening the whole photo.
 */
export function CoverBackdrop({ url, className }: { url: string | null | undefined; className?: string }) {
  if (!url) return null;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 1200×600 WebP from our bucket */}
      <img src={url} alt="" decoding="async" className="size-full object-cover" />
    </div>
  );
}

/**
 * Dark gradient behind a text block: put it inside a `relative` wrapper around the text; it starts
 * `rampPx` above the wrapper and reaches full strength where the text begins (AA: lib/images.ts).
 */
export function CoverScrim({ rampPx, fadeTo, className }: { rampPx: number; fadeTo?: { color: string; px: number }; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute -z-10", className)}
      style={{ top: -rampPx, backgroundImage: textScrim(rampPx, fadeTo) }}
    />
  );
}

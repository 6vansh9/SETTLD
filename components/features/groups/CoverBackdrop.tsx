import { cn } from "@/lib/cn";
import { COVER_TINT } from "@/lib/images";
import { pastelVar, type Pastel } from "@/lib/pastels";

/**
 * A group's background photo under a pastel tint in the group color (COVER_TINT keeps dark text
 * at WCAG AA over any photo; lib/images.test.ts). Sits behind the parent's content: give the
 * parent `relative isolate`.
 */
export function CoverBackdrop({ url, color, className }: { url: string | null | undefined; color: Pastel; className?: string }) {
  if (!url) return null;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 1200×600 WebP from our bucket */}
      <img src={url} alt="" decoding="async" className="size-full object-cover" />
      <div className="absolute inset-0" style={{ backgroundColor: pastelVar(color), opacity: COVER_TINT }} />
    </div>
  );
}

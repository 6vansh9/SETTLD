import { cn } from "@/lib/cn";
import { COVER_TINT, headerScrim, stripScrim } from "@/lib/images";
import { pastelVar, type Pastel } from "@/lib/pastels";

/**
 * A group's background photo in its real colors, with a light wash of the group color and a dark
 * gradient scrim for white text (stops proven AA in lib/images.test.ts), ending in a short fade
 * into the group's pastel. Sits behind the parent's content: give the parent `relative isolate`.
 */
export function CoverBackdrop({
  url,
  color,
  variant = "header",
  className,
}: {
  url: string | null | undefined;
  color: Pastel;
  variant?: "header" | "strip";
  className?: string;
}) {
  if (!url) return null;
  const pastel = pastelVar(color);
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 1200×600 WebP from our bucket */}
      <img src={url} alt="" decoding="async" className="size-full object-cover" />
      <div className="absolute inset-0" style={{ backgroundColor: pastel, opacity: COVER_TINT }} />
      <div className="absolute inset-0" style={{ backgroundImage: variant === "header" ? headerScrim(pastel) : stripScrim(pastel) }} />
    </div>
  );
}

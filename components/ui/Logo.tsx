import { cn } from "@/lib/cn";

/** The app icon (public/brand/icon.svg), optionally with the SETTLD wordmark. */
export function Logo({ size = 28, wordmark = true, className, textClassName }: { size?: number; wordmark?: boolean; className?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG */}
      <img src="/brand/icon.svg" alt={wordmark ? "" : "Settld"} width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />
      {wordmark && <span className={cn("font-display uppercase leading-none", textClassName)}>Settld</span>}
    </span>
  );
}

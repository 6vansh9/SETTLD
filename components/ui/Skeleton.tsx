import { cn } from "@/lib/cn";
import { PASTELS } from "@/lib/pastels";

/** Loading placeholder: soft pastel cards that pulse (never spinners). */
export function SkeletonCard({ index = 0, className }: { index?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-card motion-reduce:animate-none", className)}
      style={{ backgroundColor: `var(--${PASTELS[index % PASTELS.length]})`, opacity: 0.45 }}
    />
  );
}

/** A whole screen of skeletons: big title block + stacked pastel cards. */
export function SkeletonScreen({ cards = 3, title = true, header = false }: { cards?: number; title?: boolean; header?: boolean }) {
  return (
    <main aria-busy="true" aria-label="Loading" className="mx-auto min-h-dvh w-full max-w-app px-5 pt-[calc(16px+env(safe-area-inset-top))]">
      {header ? (
        <SkeletonCard index={0} className="-mx-5 -mt-[calc(16px+env(safe-area-inset-top))] h-[360px] rounded-t-none rounded-b-[32px]" />
      ) : (
        title && (
          <div className="mt-14 space-y-2" aria-hidden>
            <div className="h-16 w-2/3 animate-pulse rounded-2xl bg-ink/[0.07] motion-reduce:animate-none" />
            <div className="h-16 w-1/2 animate-pulse rounded-2xl bg-ink/[0.04] motion-reduce:animate-none" />
          </div>
        )
      )}
      <div className="mt-8 flex flex-col [&>*+*]:-mt-4">
        {Array.from({ length: cards }, (_, i) => (
          <SkeletonCard key={i} index={i + 1} className="h-44 border-[1.5px] border-bg" />
        ))}
      </div>
    </main>
  );
}

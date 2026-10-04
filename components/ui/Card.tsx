"use client";

import { Children, createContext, isValidElement, useContext } from "react";
import { cn } from "@/lib/cn";
import { pastelShade, pastelVar, type Pastel } from "@/lib/pastels";

const DOG_EAR = 28;
/** Set by CardStack for each item: whether a later card overlaps this one. */
const StackContext = createContext<{ overlapped: boolean } | null>(null);

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** A pastel token, or "surface" for a neutral card. */
  color?: Pastel | "surface";
  /** Folded corner in the top-right. */
  dogEar?: boolean;
}

/**
 * Poster card: 24px radius, 1.5px ink outline at 8%, no shadow.
 * Pastel cards always use dark text (--on-pastel), in both themes.
 */
export function Card({ color = "surface", dogEar = false, className, style, children, ...rest }: CardProps) {
  const stacked = useContext(StackContext);
  const isPastel = color !== "surface";

  return (
    <div
      {...rest}
      className={cn(
        "relative rounded-card border-[1.5px] p-5",
        isPastel
          ? "border-on-pastel/[0.08] text-on-pastel"
          : "border-ink/[0.08] bg-surface text-ink",
        // In a stack the next card overlaps our bottom 16px, so reserve that space.
        stacked?.overlapped && "pb-9",
        className,
      )}
      style={{
        ...(isPastel && { backgroundColor: pastelVar(color) }),
        ...(dogEar && {
          clipPath: `polygon(0 0, calc(100% - ${DOG_EAR}px) 0, 100% ${DOG_EAR}px, 100% 100%, 0 100%)`,
        }),
        ...style,
      }}
    >
      {dogEar && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 rounded-bl-[6px]"
          style={{
            width: DOG_EAR,
            height: DOG_EAR,
            backgroundColor: isPastel ? pastelShade(color) : "rgb(var(--ink-rgb) / 0.12)",
            clipPath: "polygon(0 0, 100% 100%, 0 100%)",
          }}
        />
      )}
      {children}
    </div>
  );
}

/**
 * Stacks Cards with a 16px overlap; later cards sit on top.
 * Children may wrap their Card (e.g. in a Link): the position is passed down through context.
 */
export function CardStack({ className, children }: { className?: string; children: React.ReactNode }) {
  const items = Children.toArray(children);
  return (
    <div className={cn("flex flex-col [&>*+*]:-mt-4", className)}>
      {items.map((child, i) => (
        <StackContext.Provider key={isValidElement(child) && child.key != null ? child.key : i} value={{ overlapped: i < items.length - 1 }}>
          <div className="relative">{child}</div>
        </StackContext.Provider>
      ))}
    </div>
  );
}

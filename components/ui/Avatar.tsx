"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { pastelVar, type Pastel } from "@/lib/pastels";

export type AvatarSize = "sm" | "md" | "lg";

const sizeClass: Record<AvatarSize, string> = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-[13px]",
  lg: "size-12 text-[16px]",
};

const overlapClass: Record<AvatarSize, string> = {
  sm: "-ml-1.5",
  md: "-ml-2",
  lg: "-ml-2.5",
};

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export interface AvatarProps {
  name: string;
  color?: Pastel;
  size?: AvatarSize;
  /** Ghost member (no account yet): dashed outline, no fill. */
  ghost?: boolean;
  /** Profile photo URL. Shown inside a ring in the person's color; ghosts never show one. */
  photo?: string | null;
  className?: string;
}

/** A photo in a ring of the person's color, or initials on their pastel. */
export function Avatar({ name, color = "lilac", size = "md", ghost = false, photo, className }: AvatarProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const img = useRef<HTMLImageElement>(null);
  // A server-rendered <img> can fail before hydration (onError never fires): check on mount.
  useEffect(() => {
    const el = img.current;
    if (el && photo && el.complete && el.naturalWidth === 0) setBroken(photo);
  }, [photo]);
  if (photo && !ghost && broken !== photo) {
    return (
      <span
        title={name}
        aria-label={name}
        role="img"
        className={cn("inline-flex shrink-0 select-none rounded-full p-[2px]", sizeClass[size], className)}
        style={{ backgroundColor: pastelVar(color) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny, already 256px WebP from our bucket */}
        <img
          ref={img}
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setBroken(photo)}
          className="size-full rounded-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      title={ghost ? `${name} (not joined yet)` : name}
      aria-label={ghost ? `${name}, ghost member` : name}
      role="img"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-sans font-semibold leading-none",
        sizeClass[size],
        ghost
          ? "border-[1.5px] border-dashed border-ink/40 bg-bg text-ink/60"
          : "border-[1.5px] border-on-pastel/[0.08] text-on-pastel",
        className,
      )}
      style={ghost ? undefined : { backgroundColor: pastelVar(color) }}
    >
      {initials(name)}
    </span>
  );
}

export interface AvatarStackProps {
  people: { name: string; color?: Pastel; ghost?: boolean; photo?: string | null }[];
  size?: AvatarSize;
  /** Max avatars shown before collapsing into "+N". */
  max?: number;
  className?: string;
}

/** Overlapping avatar row with a "+N" chip for the rest. */
export function AvatarStack({ people, size = "md", max = 4, className }: AvatarStackProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  // Ring in the parent's background so overlapping circles stay separate.
  const ring = "ring-2 ring-[color:var(--avatar-ring,var(--bg))]";

  return (
    <div className={cn("flex items-center", className)}>
      {shown.map((p, i) => (
        <Avatar
          key={`${p.name}-${i}`}
          {...p}
          size={size}
          className={cn(ring, i > 0 && overlapClass[size])}
        />
      ))}
      {rest > 0 && (
        <span
          aria-label={`${rest} more`}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-num leading-none text-bg",
            sizeClass[size],
            size === "sm" ? "text-[14px]" : size === "md" ? "text-[17px]" : "text-[22px]",
            ring,
            overlapClass[size],
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

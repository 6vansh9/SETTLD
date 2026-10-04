import { cn } from "@/lib/cn";

const sizeClass = {
  md: "text-[48px]",
  lg: "text-[56px]",
  xl: "text-[64px]",
} as const;

export interface TitleProps {
  line1: string;
  line2?: string;
  size?: keyof typeof sizeClass;
  as?: "h1" | "h2" | "h3";
  className?: string;
}

/** Two-line poster title: line 1 ink, line 2 ink-faded. Anton, uppercase, line-height 0.9. */
export function Title({ line1, line2, size = "lg", as: Tag = "h1", className }: TitleProps) {
  return (
    <Tag className={cn("font-display uppercase leading-[0.9]", sizeClass[size], className)}>
      <span className="block text-ink">{line1}</span>
      {line2 && <span className="block text-ink-faded">{line2}</span>}
    </Tag>
  );
}

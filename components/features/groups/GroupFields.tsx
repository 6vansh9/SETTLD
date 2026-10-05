"use client";

import { motion } from "framer-motion";
import { TextField } from "@/components/features/profile/TextField";
import { cn } from "@/lib/cn";
import { GROUP_EMOJIS, isSingleEmoji } from "@/lib/groups";
import { spring } from "@/lib/motion";
import { PASTELS, pastelVar, type Pastel } from "@/lib/pastels";

/** Live preview of the card being created/edited, in its chosen color. */
export function GroupPreview({ name, emoji, color }: { name: string; emoji: string; color: Pastel }) {
  return (
    <motion.div
      aria-hidden
      className="rounded-card border-[1.5px] border-on-pastel/[0.08] px-5 py-6 text-on-pastel transition-colors duration-300"
      style={{ backgroundColor: pastelVar(color) }}
    >
      <p className="flex items-center gap-2 font-display-alt text-[36px] uppercase leading-[0.9]">
        <span className="text-[30px]">{emoji}</span>
        <span className={cn("min-w-0 break-words", !name.trim() && "opacity-70")}>{name.trim() || "Group name"}</span>
      </p>
    </motion.div>
  );
}

export function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  const custom = !(GROUP_EMOJIS as readonly string[]).includes(value);
  return (
    <div>
      <p className="micro mb-2 text-ink-faded">Emoji</p>
      <div role="radiogroup" aria-label="Emoji" className="grid grid-cols-8 gap-1">
        {GROUP_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={value === e}
            aria-label={e}
            onClick={() => onChange(e)}
            className={cn(
              "flex aspect-square items-center justify-center rounded-xl text-[22px] transition-colors",
              value === e ? "bg-ink/10 ring-2 ring-ink" : "hover:bg-ink/5",
            )}
          >
            {e}
          </button>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-3">
        <span className="text-[13px] font-medium text-ink/60">Or type your own</span>
        <input
          aria-label="Custom emoji"
          value={custom ? value : ""}
          placeholder="🙂"
          onChange={(e) => {
            const v = e.target.value.trim();
            if (isSingleEmoji(v)) onChange(v);
          }}
          className={cn(
            "h-10 w-14 rounded-xl border-[1.5px] bg-surface text-center text-[22px] focus:border-ink focus:outline-none",
            custom ? "border-ink" : "border-ink/15",
          )}
        />
      </label>
    </div>
  );
}

export function PastelPicker({ value, onChange }: { value: Pastel; onChange: (c: Pastel) => void }) {
  return (
    <div>
      <p className="micro mb-2 text-ink-faded">Color</p>
      <div role="radiogroup" aria-label="Color" className="flex justify-between gap-2">
        {PASTELS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            onClick={() => onChange(c)}
            className="relative flex size-12 items-center justify-center"
          >
            {/* Per-option ring (no layoutId): shared-layout animations can block the sheet's exit. */}
            <motion.span
              aria-hidden
              initial={false}
              animate={{ opacity: value === c ? 1 : 0, scale: value === c ? 1 : 0.8 }}
              transition={spring}
              className="absolute inset-0 rounded-full border-[2.5px] border-ink"
            />
            <span
              className="size-9 rounded-full border-[1.5px] border-on-pastel/10"
              style={{ backgroundColor: pastelVar(c) }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function GroupNameField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  return (
    <TextField
      label="Name"
      large
      maxLength={40}
      placeholder="Goa trip"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
    />
  );
}

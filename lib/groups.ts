import type { Group, GroupType } from "@/lib/supabase/types";

export const GROUP_TYPES: { value: GroupType; label: string }[] = [
  { value: "trip", label: "Trip" },
  { value: "home", label: "Home" },
  { value: "couple", label: "Couple" },
  { value: "other", label: "Other" },
];

export const GROUP_EMOJIS = [
  "🏝️", "✈️", "🏔️", "🚗", "🏠", "🛋️", "🍕", "🍜",
  "🍻", "☕", "🎉", "🎬", "🎮", "⚽", "🛒", "💡",
  "💸", "❤️", "🐶", "🎓", "🏕️", "🚆", "🎤", "🧳",
] as const;

export const NAME_MAX = 40;

/** Mirrors the DB's clean_name(): trimmed, 1–40 characters. Returns an error message or null. */
export function validateName(name: string, what = "Group name"): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return `${what} can't be empty`;
  if ([...trimmed].length > NAME_MAX) return `${what} is too long (${NAME_MAX} characters max)`;
  return null;
}

/** Exactly one emoji (a single grapheme that is pictographic). */
export function isSingleEmoji(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)];
  return graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(trimmed);
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/join/${token}`;
}

export function inviteShareText(group: Pick<Group, "name" | "emoji">, url: string): string {
  return `${group.emoji} Join ${group.name} on Settld. We split everything there, live. Tap to join: ${url}`;
}

export function claimShareText(ghostName: string, groupName: string, url: string): string {
  const first = ghostName.trim().split(/\s+/)[0];
  return `Hey ${first}! Your spot in ${groupName} on Settld is saved. Tap to claim it: ${url}`;
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Active groups first (newest first), archived ones separately. */
export function partitionGroups<T extends Pick<Group, "archived_at" | "created_at">>(groups: T[]) {
  const newestFirst = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  return {
    active: groups.filter((g) => !g.archived_at).sort(newestFirst),
    archived: groups.filter((g) => g.archived_at).sort(newestFirst),
  };
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Micro-label date: TODAY, YESTERDAY, 12 SEP, or 12 SEP 25 for other years (local time). */
export function microDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86_400_000);
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "YESTERDAY";
  const base = `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${String(d.getFullYear()).slice(-2)}`;
}

/** Turn a Supabase/Postgres error into something a person can read. */
export function friendlyError(error: unknown): string {
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  if (!message) return "Something went wrong. Try again.";
  if (/failed to fetch|network/i.test(message)) return "You're offline. Check your connection and try again.";
  if (/check constraint|violates|syntax|permission denied|JWT/i.test(message)) return "Something went wrong. Try again.";
  return message;
}

/** microDate for a calendar date ("2026-10-04", no time zone): parsed as a local date. */
export function microDay(ymd: string, now: Date = new Date()): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return microDate(new Date(y, (m ?? 1) - 1, d ?? 1).toISOString(), now);
}

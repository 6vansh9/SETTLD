import { isCurrencyCode } from "@/lib/money";
import { PASTELS, type Pastel } from "@/lib/pastels";
import type { Profile } from "@/lib/supabase/types";

/** Mirrors public.default_profile_name() in 0001_profiles.sql: Google name, else email local part. */
export function defaultProfileName(meta: Record<string, unknown> | null | undefined, email: string | null | undefined): string {
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const name = pick(meta?.full_name) ?? pick(meta?.name) ?? (email ?? "").split("@")[0];
  // Count code points like Postgres char_length/left, so emoji never get cut in half.
  return [...name.trim()].slice(0, 40).join("");
}

/**
 * Make a profile row safe to render, whatever a manual backfill or older schema left in it:
 * null/unknown values fall back to the column defaults.
 */
export function normalizeProfile(raw: Partial<Record<keyof Profile, unknown>> & { id: string }): Profile {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const color = str(raw.avatar_color);
  const currency = str(raw.default_currency);
  return {
    id: raw.id,
    name: str(raw.name) ?? "",
    avatar_color: color && (PASTELS as readonly string[]).includes(color) ? (color as Pastel) : "lilac",
    upi_id: str(raw.upi_id)?.trim() || null,
    default_currency: currency && isCurrencyCode(currency) ? currency : "INR",
    privacy_blur: raw.privacy_blur === true,
    onboarded_at: str(raw.onboarded_at),
    avatar_url: str(raw.avatar_url) || null,
    created_at: str(raw.created_at) ?? "",
    updated_at: str(raw.updated_at) ?? "",
  };
}

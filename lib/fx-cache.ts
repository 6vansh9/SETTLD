import { isCurrencyCode, parseRate, rateToString, type CurrencyCode } from "@/lib/money";

/** PRD › Currencies: rates are cached for 6 hours. */
export const FX_TTL_MS = 6 * 60 * 60 * 1000;

export type RateSource = "identity" | "cache" | "live" | "stale";

export interface FxQuote {
  base: CurrencyCode;
  quote: CurrencyCode;
  /** Canonical decimal string ("96.32"): 1 base = rate quote */
  rate: string;
  fetchedAt: string;
  source: RateSource;
}

export function isFresh(fetchedAt: string, now: number = Date.now()): boolean {
  const t = Date.parse(fetchedAt);
  return Number.isFinite(t) && now - t < FX_TTL_MS && t <= now + 60_000;
}

/** Frankfurter /v1/latest?base=USD&symbols=INR → "96.32" (canonical), or null if unusable. */
export function parseFrankfurter(json: unknown, quote: CurrencyCode): string | null {
  const rates = (json as { rates?: Record<string, unknown> } | null)?.rates;
  const value = rates?.[quote];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  // Frankfurter returns ≤ 5 decimals; toFixed(10) avoids exponent notation for tiny rates.
  const scaled = parseRate(value.toFixed(10));
  return scaled ? rateToString(scaled) : null;
}

/**
 * Pick what to serve: fresh cache, else live, else whatever cache we have (stale).
 * Returns null only when there is no rate at all.
 */
export function chooseQuote(
  base: CurrencyCode,
  quote: CurrencyCode,
  cached: { rate: string; fetched_at: string } | null,
  live: (() => Promise<string | null>) | null,
  now: number = Date.now(),
): Promise<FxQuote | null> {
  if (base === quote) return Promise.resolve({ base, quote, rate: "1", fetchedAt: new Date(now).toISOString(), source: "identity" });
  if (cached && isFresh(cached.fetched_at, now)) {
    return Promise.resolve({ base, quote, rate: canonical(cached.rate), fetchedAt: cached.fetched_at, source: "cache" });
  }
  const fallback = (): FxQuote | null =>
    cached ? { base, quote, rate: canonical(cached.rate), fetchedAt: cached.fetched_at, source: "stale" } : null;
  if (!live) return Promise.resolve(fallback());
  return live().then(
    (rate) => (rate ? { base, quote, rate, fetchedAt: new Date(now).toISOString(), source: "live" as const } : fallback()),
    () => fallback(),
  );
}

function canonical(rate: string): string {
  const scaled = parseRate(rate);
  return scaled ? rateToString(scaled) : rate;
}

export function parsePair(from: unknown, to: unknown): { base: CurrencyCode; quote: CurrencyCode } | null {
  return typeof from === "string" && typeof to === "string" && isCurrencyCode(from) && isCurrencyCode(to)
    ? { base: from, quote: to }
    : null;
}

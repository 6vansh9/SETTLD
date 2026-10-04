import { chooseQuote, parseFrankfurter, type FxQuote } from "@/lib/fx-cache";
import type { CurrencyCode } from "@/lib/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-only FX (PRD › Currencies): Frankfurter API, cached in fx_rates for 6 hours, falling back
 * to the latest cached rate if the API is down. The browser never calls Frankfurter directly;
 * it goes through /api/fx.
 */
const FRANKFURTER = "https://api.frankfurter.dev/v1/latest";
const TIMEOUT_MS = 4000;

async function fetchLive(base: CurrencyCode, quote: CurrencyCode): Promise<string | null> {
  const res = await fetch(`${FRANKFURTER}?base=${base}&symbols=${quote}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  return parseFrankfurter(await res.json(), quote);
}

export async function getRate(base: CurrencyCode, quote: CurrencyCode): Promise<FxQuote | null> {
  if (base === quote) return chooseQuote(base, quote, null, null);

  const admin = createAdminClient();
  // Reads work with either client (fx_rates is readable by signed-in users).
  const reader = admin ?? createClient();
  const { data: cached } = await reader
    .from("fx_rates")
    .select("rate, fetched_at")
    .eq("base", base)
    .eq("quote", quote)
    .maybeSingle();

  const quoteResult = await chooseQuote(
    base,
    quote,
    cached ? { rate: String(cached.rate), fetched_at: cached.fetched_at } : null,
    () => fetchLive(base, quote),
  );

  if (quoteResult?.source === "live") {
    if (admin) {
      const { error } = await admin
        .from("fx_rates")
        .upsert({ base, quote, rate: quoteResult.rate, fetched_at: quoteResult.fetchedAt }, { onConflict: "base,quote" });
      if (error) console.error("[fx] cache write failed", error.message);
    } else {
      console.warn("[fx] SUPABASE_SERVICE_ROLE_KEY not set: serving live rates without caching");
    }
  }
  return quoteResult;
}

/** Several pairs at once (Home overall total). Missing rates are simply absent from the map. */
export async function getRates(pairs: { base: CurrencyCode; quote: CurrencyCode }[]): Promise<Record<string, FxQuote>> {
  const unique = [...new Map(pairs.map((p) => [`${p.base}:${p.quote}`, p])).values()];
  const results = await Promise.all(unique.map((p) => getRate(p.base, p.quote).catch(() => null)));
  return Object.fromEntries(results.filter((q): q is FxQuote => !!q).map((q) => [`${q.base}:${q.quote}`, q]));
}

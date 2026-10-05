/**
 * Money helpers. All amounts are integer minor units (paise, cents).
 * Never convert money to a float: parsing and formatting work on strings and bigints.
 */

export const CURRENCY_CODES = ["INR", "USD", "AUD", "EUR", "GBP"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export type Minor = number | bigint;

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  decimals: number;
  /** "indian" = 1,24,000 · "western" = 124,000 */
  grouping: "indian" | "western";
  name: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  INR: { code: "INR", symbol: "₹", decimals: 2, grouping: "indian", name: "Indian Rupee" },
  USD: { code: "USD", symbol: "$", decimals: 2, grouping: "western", name: "US Dollar" },
  AUD: { code: "AUD", symbol: "A$", decimals: 2, grouping: "western", name: "Australian Dollar" },
  EUR: { code: "EUR", symbol: "€", decimals: 2, grouping: "western", name: "Euro" },
  GBP: { code: "GBP", symbol: "£", decimals: 2, grouping: "western", name: "British Pound" },
};

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(value);
}

function assertInteger(value: Minor): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Minor units must be a safe integer, got ${value}`);
  }
  return BigInt(value);
}

/**
 * Parse a major-unit decimal ("1240.5", "1,240.50", 12) into minor units as a bigint.
 * Throws if the input has more decimals than the currency allows.
 */
export function toMinor(major: string | number, currency: CurrencyCode): bigint {
  const { decimals } = CURRENCIES[currency];
  const raw = (typeof major === "number" ? String(major) : major).replace(/[,\s]/g, "");
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(raw);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new RangeError(`Not a valid amount: "${major}"`);
  }
  const [, neg, whole, frac = ""] = match;
  if (frac.length > decimals) {
    throw new RangeError(`${currency} allows at most ${decimals} decimals, got "${major}"`);
  }
  const minor = BigInt((whole || "0") + frac.padEnd(decimals, "0"));
  return neg ? -minor : minor;
}

/** Minor units to a plain decimal string ("1240.50"). Returns a string, never a float. */
export function fromMinor(minor: Minor, currency: CurrencyCode): string {
  const { whole, fraction, negative } = splitMinor(minor, currency);
  const body = fraction ? `${whole}.${fraction}` : whole;
  return negative ? `-${body}` : body;
}

function splitMinor(minor: Minor, currency: CurrencyCode) {
  const { decimals } = CURRENCIES[currency];
  const value = assertInteger(minor);
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  return { negative, whole: digits.slice(0, cut), fraction: digits.slice(cut) };
}

/** Insert thousands separators. Indian: last 3 digits, then groups of 2 (1,24,000). */
export function groupDigits(digits: string, grouping: CurrencyMeta["grouping"]): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const size = grouping === "indian" ? 2 : 3;
  const groups: string[] = [];
  for (let end = rest.length; end > 0; end -= size) {
    groups.unshift(rest.slice(Math.max(0, end - size), end));
  }
  return `${groups.join(",")},${last3}`;
}

export interface AmountParts {
  negative: boolean;
  symbol: string;
  /** Grouped whole number, e.g. "1,24,000" */
  whole: string;
  /** Decimal part including the dot, e.g. ".50" ("" for zero-decimal currencies) */
  fraction: string;
}

/** Split an amount into the strong part (whole) and faded parts (symbol, fraction). */
export function formatParts(minor: Minor, currency: CurrencyCode): AmountParts {
  const meta = CURRENCIES[currency];
  const { negative, whole, fraction } = splitMinor(minor, currency);
  return {
    negative,
    symbol: meta.symbol,
    whole: groupDigits(whole, meta.grouping),
    fraction: fraction ? `.${fraction}` : "",
  };
}

/** Plain-text amount, e.g. "₹1,24,000.50" or "-$40.00". Used for aria-labels and share text. */
export function formatAmount(minor: Minor, currency: CurrencyCode): string {
  const p = formatParts(minor, currency);
  return `${p.negative ? "-" : ""}${p.symbol}${p.whole}${p.fraction}`;
}

/** Like formatAmount, but whole amounts drop the zero fraction: "₹340", "₹12.50". For short text (push, nudges). */
export function formatAmountShort(minor: Minor, currency: CurrencyCode): string {
  const p = formatParts(minor, currency);
  const fraction = /^\D0+$/.test(p.fraction) ? "" : p.fraction;
  return `${p.negative ? "-" : ""}${p.symbol}${p.whole}${fraction}`;
}

/**
 * Split a total into n integer parts that sum exactly to the total.
 * Leftover minor units go to the first members (stable order).
 */
export function splitEqual(totalMinor: number, n: number): number[];
export function splitEqual(totalMinor: bigint, n: number): bigint[];
export function splitEqual(totalMinor: Minor, n: number): Minor[] {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Cannot split between ${n} people`);
  }
  const total = assertInteger(totalMinor);
  const count = BigInt(n);
  const negative = total < BigInt(0);
  const abs = negative ? -total : total;
  const base = abs / count;
  const remainder = Number(abs % count);
  const parts = Array.from({ length: n }, (_, i) => {
    const part = i < remainder ? base + BigInt(1) : base;
    return negative ? -part : part;
  });
  return typeof totalMinor === "bigint" ? parts : parts.map(Number);
}

/**
 * Whole-number percentages for display that always sum to 100
 * (largest-remainder method). Returns zeros if the total is zero.
 */
export function percentages(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + Math.abs(v), 0);
  if (total === 0) return values.map(() => 0);
  const exact = values.map((v) => (Math.abs(v) / total) * 100);
  const floored = exact.map(Math.floor);
  let left = 100 - floored.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floored[i] += 1;
    left -= 1;
  }
  return floored;
}

/* ------------------------------------------------------------------------------------------------
 * Splitting (PRD › Expenses). Everything is integer minor units; proportional maths runs in
 * BigInt so total × weight can never lose precision. Leftover minor units go to the first
 * members (in the order given) that have a non-zero weight, so splits always sum to the total.
 * --------------------------------------------------------------------------------------------- */

export const SPLIT_TYPES = ["equal", "exact", "percent", "shares"] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

/** 100% in basis points: percentages are entered with up to 2 decimals (33.33% = 3333). */
export const PERCENT_TOTAL = 10_000;

function assertMinor(value: number, what: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a non-negative integer number of minor units, got ${value}`);
  }
}

/**
 * Split `total` in proportion to integer `weights`. Members with weight 0 get 0.
 * Floors each share, then hands the leftover one unit at a time to the first weighted members.
 */
export function splitByWeights(total: number, weights: readonly number[]): number[] {
  assertMinor(total, "Total");
  weights.forEach((w) => {
    if (!Number.isSafeInteger(w) || w < 0) throw new RangeError(`Weights must be non-negative integers, got ${w}`);
  });
  const sum = weights.reduce((a, b) => a + BigInt(b), BigInt(0));
  if (sum === BigInt(0)) throw new RangeError("At least one weight must be positive");

  const t = BigInt(total);
  const parts = weights.map((w) => (t * BigInt(w)) / sum);
  let leftover = t - parts.reduce((a, b) => a + b, BigInt(0));
  for (let i = 0; leftover > BigInt(0); i = (i + 1) % weights.length) {
    if (weights[i] > 0) {
      parts[i] += BigInt(1);
      leftover -= BigInt(1);
    }
  }
  return parts.map(Number);
}

/** Parse a percentage like "33.33" into basis points (3333). Null if invalid or > 2 decimals. */
export function parsePercent(input: string): number | null {
  const m = /^\s*(\d{1,3})(?:\.(\d{0,2}))?\s*$/.exec(input);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp <= PERCENT_TOTAL ? bp : null;
}

export function formatPercent(bp: number): string {
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

/** Parse a share count like "2". Positive integers up to 1000; null otherwise. */
export function parseShares(input: string): number | null {
  const m = /^\s*(\d{1,4})\s*$/.exec(input);
  if (!m) return null;
  const n = Number(m[1]);
  return n <= 1000 ? n : null;
}

export interface SplitMemberInput {
  memberId: string;
  /** exact: minor units · percent: basis points · shares: share count · equal: ignored */
  value?: number;
}

export interface MemberAmount {
  memberId: string;
  amount: number;
}

export type SplitResult =
  | { ok: true; splits: (MemberAmount & { rawValue: number | null })[] }
  | {
      ok: false;
      error: string;
      /** For exact splits: minor units still to assign (negative = over-assigned). */
      remaining?: number;
      /** For percent splits: basis points still to assign (negative = over). */
      remainingPercent?: number;
    };

/**
 * Compute exact per-member amounts for any split type.
 * `members` are the people included in the split, in stable (display) order.
 */
export function computeSplits(total: number, type: SplitType, members: readonly SplitMemberInput[]): SplitResult {
  assertMinor(total, "Total");
  if (total === 0) return { ok: false, error: "Enter an amount" };
  if (members.length === 0) return { ok: false, error: "Pick at least one person" };
  const ids = new Set(members.map((m) => m.memberId));
  if (ids.size !== members.length) return { ok: false, error: "Someone is in the split twice" };

  switch (type) {
    case "equal": {
      const parts = splitEqual(total, members.length);
      return { ok: true, splits: members.map((m, i) => ({ memberId: m.memberId, amount: parts[i], rawValue: null })) };
    }
    case "exact": {
      const values = members.map((m) => m.value ?? 0);
      if (values.some((v) => !Number.isSafeInteger(v) || v < 0)) return { ok: false, error: "Amounts can't be negative" };
      const remaining = total - values.reduce((a, b) => a + b, 0);
      if (remaining !== 0) return { ok: false, error: remaining > 0 ? "Not all of it is assigned" : "Assigned more than the total", remaining };
      if (values.every((v) => v === 0)) return { ok: false, error: "Assign the amount to someone", remaining };
      return { ok: true, splits: members.map((m, i) => ({ memberId: m.memberId, amount: values[i], rawValue: values[i] })) };
    }
    case "percent": {
      const bps = members.map((m) => m.value ?? 0);
      if (bps.some((v) => !Number.isSafeInteger(v) || v < 0)) return { ok: false, error: "Percentages can't be negative" };
      const remainingPercent = PERCENT_TOTAL - bps.reduce((a, b) => a + b, 0);
      if (remainingPercent !== 0) {
        return { ok: false, error: remainingPercent > 0 ? "Percentages must add up to 100%" : "Percentages add up to more than 100%", remainingPercent };
      }
      const parts = splitByWeights(total, bps);
      return { ok: true, splits: members.map((m, i) => ({ memberId: m.memberId, amount: parts[i], rawValue: bps[i] })) };
    }
    case "shares": {
      const shares = members.map((m) => m.value ?? 0);
      if (shares.some((v) => !Number.isSafeInteger(v) || v < 0)) return { ok: false, error: "Shares must be whole numbers" };
      if (shares.every((v) => v === 0)) return { ok: false, error: "Give someone at least 1 share" };
      const parts = splitByWeights(total, shares);
      return { ok: true, splits: members.map((m, i) => ({ memberId: m.memberId, amount: parts[i], rawValue: shares[i] })) };
    }
  }
}

/** Multiple payers: what's left to assign (0 = valid, negative = over). */
export function payersRemaining(total: number, payers: readonly MemberAmount[]): number {
  return total - payers.reduce((a, p) => a + p.amount, 0);
}

export function validatePayers(total: number, payers: readonly MemberAmount[]): string | null {
  if (payers.length === 0) return "Pick who paid";
  if (new Set(payers.map((p) => p.memberId)).size !== payers.length) return "Someone is listed as paying twice";
  if (payers.some((p) => !Number.isSafeInteger(p.amount) || p.amount <= 0)) return "Each payer needs an amount";
  const left = payersRemaining(total, payers);
  if (left > 0) return "Paid amounts don't cover the total";
  if (left < 0) return "Paid amounts are more than the total";
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Currency conversion (PRD › Currencies). A rate means "1 unit of the expense currency =
 * `rate` units of the group's base currency". Rates are decimal strings, parsed to a BigInt
 * scaled by 10^10 (the precision of expenses.fx_rate_to_base numeric(20,10)), so conversion is
 * exact integer maths with no floats. Every supported currency has 2 decimals, so minor units
 * convert directly.
 * --------------------------------------------------------------------------------------------- */

export const RATE_DECIMALS = 10;
const RATE_SCALE = BigInt(10) ** BigInt(RATE_DECIMALS);

/** Parse "96.32" / "0.89087" into a scaled BigInt. Null if not a positive decimal with ≤ 10 decimals. */
export function parseRate(input: string | number): bigint | null {
  const s = String(input).trim();
  const m = /^(\d{1,9})(?:\.(\d{1,10}))?$/.exec(s);
  if (!m) return null;
  const scaled = BigInt(m[1]) * RATE_SCALE + BigInt((m[2] ?? "").padEnd(RATE_DECIMALS, "0"));
  return scaled > BigInt(0) ? scaled : null;
}

/** Canonical rate string (trailing zeros trimmed), e.g. 96.32 → "96.32", 1 → "1". */
export function rateToString(scaled: bigint): string {
  const whole = scaled / RATE_SCALE;
  const frac = (scaled % RATE_SCALE).toString().padStart(RATE_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Convert minor units with a scaled rate, rounding half up (away from zero for positives),
 * matching Postgres `round(amount * fx_rate_to_base)` for the same rate.
 */
export function convertMinor(amount: number, rate: bigint): number {
  assertMinor(amount, "Amount");
  const product = BigInt(amount) * rate;
  const rounded = (product + RATE_SCALE / BigInt(2)) / RATE_SCALE;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Converted amount is too large");
  return Number(rounded);
}

/**
 * Map amounts entered in the expense currency onto the converted total, proportionally.
 * The result always sums exactly to `amountBase` (leftovers to the first weighted entries),
 * so splits and payers stay consistent with the expense's amount_base.
 */
export function allocateToBase(amounts: readonly number[], amountBase: number): number[] {
  if (amounts.length === 0) return [];
  return splitByWeights(amountBase, amounts);
}

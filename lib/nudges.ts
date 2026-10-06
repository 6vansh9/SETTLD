import { formatAmountShort, type CurrencyCode } from "@/lib/money";

/**
 * Escalating nudges (PRD › Personality › Escalating nudges). Level 1 polite, 2 cheeky, 3 dramatic,
 * picked by the server from how many times I've nudged them since they last settled up.
 * The sender's phone picks a random template index; the server stores it with the nudge, so the
 * push and the in-app banner show the same words. Placeholders: {name} {amount} {days} {from}.
 * {days} renders as "less than a day" / "1 day" / "9 days".
 */
export const NUDGE_TEMPLATES: Record<1 | 2 | 3, string[]> = {
  1: [
    "Hey {name}, small reminder: {amount} to {from} whenever you get a sec.",
    "{name}, no rush, but {amount} is waiting for you on Settld.",
    "Friendly nudge from {from}: {amount} is still open.",
    "{name}! Quick one: {amount} to settle with {from}.",
    "Just a gentle tap on the shoulder, {name}. {amount} to {from}.",
    "When you have a minute, {name}: {amount} for {from}.",
    "{from} says hi. Also, {amount}.",
    "Psst {name}, {amount} is hanging around on Settld.",
    "{name}, settling up {amount} takes about four seconds.",
    "A polite little reminder: you owe {from} {amount}.",
  ],
  2: [
    "{name}. {amount}. Just saying.",
    "Hey {name}, {amount} has been waiting {days}. It's getting comfortable.",
    "{name}, your {amount} to {from} is starting to feel like a subscription.",
    "Not to be dramatic, {name}, but {amount} is still a thing.",
    "{from} would like a word. The word is {amount}.",
    "{name}, {amount} is waving at you. Wave back?",
    "It's been {days}, {name}. {amount} wants to go home.",
    "Another reminder: {amount}. {from} is counting. Lovingly.",
    "{name}, {amount} called. It wants to be settled.",
    "Several nudges in, {name}. {amount} and {from} believe in you.",
  ],
  3: [
    "{name}. It's been {days}. The {amount} misses you.",
    "{name}, {from} has written a song about {amount}. Please don't make them sing it.",
    "Day {daycount} of waiting for {amount}. {from} is fine. Totally fine.",
    "{name}. {amount}. {days}. We need to talk.",
    "Breaking news: {amount} still unpaid after {days}. More at 9.",
    "{name}, the {amount} has started telling people it's your friend.",
    "{from} has lit a candle for {amount}. It's been {days}, {name}.",
    "This is the final boss of nudges, {name}. {amount}.",
    "{name}, {amount} has been gone {days}. Its plant is wilting.",
    "Dear {name}, it's been {days}. {amount} remains. Yours dramatically, {from}.",
  ],
};

export type NudgeLevel = 1 | 2 | 3;

export function daysText(days: number): string {
  if (days <= 0) return "less than a day";
  return days === 1 ? "1 day" : `${days} days`;
}

export function randomTemplate(rand: () => number = Math.random): number {
  return Math.floor(rand() * 10);
}

/** The nudge sentence for a level and stored template index (indexes wrap, so old rows still render). */
export function nudgeText(o: { level: number; template: number; name: string; from: string; amount: number; currency: CurrencyCode; days: number }): string {
  const level = (Math.min(3, Math.max(1, Math.round(o.level))) as NudgeLevel);
  const list = NUDGE_TEMPLATES[level];
  const t = list[((o.template % list.length) + list.length) % list.length];
  const first = (n: string) => n.trim().split(/\s+/)[0] || n;
  const fill: [string, string][] = [
    ["{name}", first(o.name)],
    ["{from}", first(o.from)],
    ["{amount}", formatAmountShort(o.amount, o.currency)],
    ["{daycount}", String(Math.max(1, o.days))],
    ["{days}", daysText(o.days)],
  ];
  // split/join rather than replaceAll (older iOS Safari).
  return fill.reduce((s, [k, v]) => s.split(k).join(v), t);
}

/**
 * The limits live in ONE place: the database function public.nudge_rules()
 * (supabase/migrations/0014_nudge_cooldown_patch.sql). send_nudge enforces them; the app reads them
 * (useNudgeRules) only to show the countdown. Change them there; no deploy needed.
 */
export interface NudgeRules {
  cooldown_seconds: number;
  daily_cap: number;
  polite_until: number;
  cheeky_until: number;
}

export type NudgeAvailability = { state: "ready" } | { state: "cooldown"; at: number } | { state: "cap"; at: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Can I nudge this person now? `sentAts` = my nudges to them (any order). Daily cap first (rolling
 * 24 h; `at` = when the oldest of those drops out), then the cooldown. Rules not loaded yet
 * (or offline) → "ready"; the server still enforces both.
 */
export function nudgeAvailability(sentAts: readonly string[], rules: NudgeRules | null | undefined, now: number = Date.now()): NudgeAvailability {
  if (!rules) return { state: "ready" };
  const times = sentAts.map((t) => Date.parse(t)).filter(Number.isFinite).sort((a, b) => a - b);
  const today = times.filter((t) => t > now - DAY_MS);
  if (rules.daily_cap > 0 && today.length >= rules.daily_cap) return { state: "cap", at: today[today.length - rules.daily_cap] + DAY_MS };
  const last = times[times.length - 1];
  const at = last + rules.cooldown_seconds * 1000;
  return last !== undefined && at > now ? { state: "cooldown", at } : { state: "ready" };
}

/** "1:42" until `at` (rounded up to the next second); past an hour "4 h 12 min". Relative, so always in the phone's own time. */
export function countdown(at: number, now: number = Date.now()): string {
  const secs = Math.max(0, Math.ceil((at - now) / 1000));
  if (secs >= 3600) {
    const mins = Math.ceil(secs / 60);
    return `${Math.floor(mins / 60)} h ${mins % 60} min`;
  }
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export const DAILY_CAP_TEXT = "Daily nudge limit reached · try again tomorrow";

/**
 * A refused nudge → when it's allowed again. Reads the retry time from the error detail
 * ("retry_at=…", 0014), and also understands older servers ("…again at 2026-10-06T14:35:34Z",
 * "…again in 1:42"), so a raw timestamp never reaches the screen.
 */
export function nudgeRetry(error: unknown, now: number = Date.now()): { state: "cooldown" | "cap"; at: number } | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { message?: unknown; details?: unknown };
  const message = typeof e.message === "string" ? e.message : "";
  const details = typeof e.details === "string" ? e.details : "";
  const cap = /daily nudge limit/i.test(message);
  if (!cap && !/nudge (them )?again/i.test(message)) return null;
  const iso = /retry_at=(\S+)/.exec(details)?.[1] ?? /again at (\d{4}-\d\d-\d\dT[\d:.]+Z)/.exec(message)?.[1];
  let at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) {
    const mmss = /again in (\d+):(\d\d)/.exec(message);
    at = mmss ? now + (Number(mmss[1]) * 60 + Number(mmss[2])) * 1000 : cap ? now + DAY_MS : NaN;
  }
  return Number.isFinite(at) ? { state: cap ? "cap" : "cooldown", at } : null;
}

/** What to say for a refused nudge: "Nudge again in 1:42", the daily-cap line, or null if it wasn't about timing. */
export function nudgeRetryText(retry: { state: "cooldown" | "cap"; at: number } | null, now: number = Date.now()): string | null {
  if (!retry) return null;
  return retry.state === "cap" ? DAILY_CAP_TEXT : `Nudge again in ${countdown(retry.at, now)}`;
}

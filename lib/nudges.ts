import { formatAmountShort, type CurrencyCode } from "@/lib/money";

/**
 * Escalating nudges (PRD › Personality › Escalating nudges). Level 1 polite, 2 cheeky, 3 dramatic.
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
    "Reminder #2: {amount}. {from} is counting. Lovingly.",
    "{name}, {amount} called. It wants to be settled.",
    "Two nudges in, {name}. {amount} and {from} believe in you.",
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

export const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** When I can next nudge this person (null = now). */
export function nextNudgeAt(lastSentAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!lastSentAt) return null;
  const at = Date.parse(lastSentAt) + NUDGE_COOLDOWN_MS;
  return at > now ? at : null;
}

/** "in 5 h" / "in 40 min" for the disabled Nudge button. */
export function untilText(at: number, now: number = Date.now()): string {
  const mins = Math.max(1, Math.ceil((at - now) / 60000));
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.round(mins / 60)} h`;
}

/** Presence on the group channel (PRD › Presence payload: { member_id, typing, screen }). */
export type PresenceScreen = "group" | "add-expense" | "settle";

export interface PresenceState {
  member_id: string;
  typing: boolean;
  screen: PresenceScreen;
}

const VERB: Partial<Record<PresenceScreen, string>> = {
  "add-expense": "adding an expense",
  settle: "settling up",
};

/** "Aman is adding an expense…" / "Aman and 2 others are settling up…", ignoring me. Null when nobody is. */
export function presenceText(states: readonly PresenceState[], myMemberId: string, names: Map<string, string>): string | null {
  const active = new Map<string, PresenceState>();
  for (const s of states) if (s.member_id !== myMemberId && s.typing && VERB[s.screen]) active.set(s.member_id, s);
  const people = [...active.values()];
  if (people.length === 0) return null;
  const name = (id: string) => (names.get(id) ?? "Someone").split(" ")[0];
  const verb = VERB[people[0].screen]!;
  if (people.length === 1) return `${name(people[0].member_id)} is ${verb}…`;
  const sameVerb = people.every((p) => p.screen === people[0].screen);
  const others = people.length - 1;
  return `${name(people[0].member_id)} and ${others} ${others === 1 ? "other" : "others"} are ${sameVerb ? verb.replace("an expense", "expenses") : "busy"}…`;
}

/**
 * Trailing throttle: at most one call per `ms`, always delivering the latest value
 * (PRD: presence updates throttled to one per second).
 */
export function createThrottle<T>(fn: (value: T) => void, ms: number, now: () => number = Date.now, schedule = setTimeout, cancel = clearTimeout) {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: T;
  const flush = () => {
    timer = null;
    last = now();
    fn(latest);
  };
  return {
    push(value: T) {
      latest = value;
      const wait = last + ms - now();
      if (wait <= 0 && !timer) flush();
      else if (!timer) timer = schedule(flush, Math.max(0, wait));
    },
    cancel() {
      if (timer) cancel(timer);
      timer = null;
    },
  };
}

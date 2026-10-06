import { describe, expect, it } from "vitest";
import { daysText, nudgeAvailability, countdown, nudgeRetry, nudgeRetryText, DAILY_CAP_TEXT, NUDGE_TEMPLATES, nudgeText, randomTemplate } from "./nudges";

describe("nudge templates", () => {
  it("about 10 per level, every one mentions the amount and leaves no placeholder behind", () => {
    for (const level of [1, 2, 3] as const) {
      expect(NUDGE_TEMPLATES[level]).toHaveLength(10);
      NUDGE_TEMPLATES[level].forEach((t, i) => {
        expect(t).toContain("{amount}");
        const s = nudgeText({ level, template: i, name: "Aman Rao", from: "Vansh Gupta", amount: 34000, currency: "INR", days: 9 });
        expect(s).not.toMatch(/[{}]/);
        expect(s).toContain("₹340");
      });
    }
  });

  it("the PRD example (level 3)", () => {
    expect(nudgeText({ level: 3, template: 0, name: "Aman Rao", from: "Vansh", amount: 34000, currency: "INR", days: 9 })).toBe(
      "Aman. It's been 9 days. The ₹340 misses you.",
    );
  });

  it("levels clamp, template indexes wrap, days read naturally", () => {
    expect(nudgeText({ level: 7, template: 10, name: "A", from: "B", amount: 100, currency: "USD", days: 0 })).toBe(nudgeText({ level: 3, template: 0, name: "A", from: "B", amount: 100, currency: "USD", days: 0 }));
    expect(daysText(0)).toBe("less than a day");
    expect(daysText(1)).toBe("1 day");
    expect(daysText(12)).toBe("12 days");
    for (let i = 0; i < 50; i++) expect(randomTemplate()).toBeGreaterThanOrEqual(0);
    expect(randomTemplate(() => 0.999)).toBe(9);
  });

  const rules = { cooldown_seconds: 3600, daily_cap: 10, polite_until: 3, cheeky_until: 6 };
  const at = (iso: string) => Date.parse(iso);

  it("1-hour cooldown per person, then ready again", () => {
    const now = at("2026-10-05T12:00:00Z");
    expect(nudgeAvailability([], rules, now)).toEqual({ state: "ready" });
    expect(nudgeAvailability(["2026-10-05T10:59:00Z"], rules, now)).toEqual({ state: "ready" });
    const a = nudgeAvailability(["2026-10-05T11:58:30Z", "2026-10-05T10:40:00Z"], rules, now);
    expect(a).toEqual({ state: "cooldown", at: at("2026-10-05T12:58:30Z") });
    expect(countdown(a.state === "cooldown" ? a.at : 0, now)).toBe("58:30");
    expect(countdown(now + 3_600_000, now)).toBe("60:00");
    expect(countdown(at("2026-10-05T12:01:42Z"), now)).toBe("1:42");
    expect(countdown(at("2026-10-05T12:00:00.200Z"), now)).toBe("0:01"); // rounds up: never shows 0:00 while blocked
    expect(countdown(now - 5, now)).toBe("0:00");
    expect(countdown(now + 3_725_000, now)).toBe("1 h 3 min");
    expect(countdown(now + 19 * 3_600_000, now)).toBe("19 h 0 min");
  });

  it("daily cap: 10 in a rolling 24 h; frees up when the oldest of them is a day old", () => {
    const now = at("2026-10-05T12:00:00Z");
    const ten = Array.from({ length: 10 }, (_, i) => new Date(now - (i + 1) * 3_600_000).toISOString()); // 1 h … 10 h ago
    expect(nudgeAvailability(ten, rules, now)).toEqual({ state: "cap", at: now - 10 * 3_600_000 + 86_400_000 });
    expect(nudgeAvailability(ten.slice(0, 9), rules, now)).toEqual({ state: "ready" });
    const old = [...ten.slice(0, 9), "2026-10-04T11:59:00Z"]; // one is over a day old
    expect(nudgeAvailability(old, rules, now)).toEqual({ state: "ready" });
  });

  it("rules not loaded (or offline): the button stays usable; the server decides", () => {
    expect(nudgeAvailability([new Date().toISOString()], null)).toEqual({ state: "ready" });
  });

  it("refused nudges become a countdown, never a raw timestamp (new and old servers)", () => {
    const now = Date.parse("2026-10-06T14:33:52Z");
    const fresh = { message: "Nudge again in 1:42", details: "retry_at=2026-10-06T14:35:34.000Z" };
    expect(nudgeRetry(fresh, now)).toEqual({ state: "cooldown", at: Date.parse("2026-10-06T14:35:34Z") });
    expect(nudgeRetryText(nudgeRetry(fresh, now), now)).toBe("Nudge again in 1:42");
    // The original 24 h server: "You can nudge them again at <ISO>".
    const legacy = { message: "You can nudge them again at 2026-10-06T19:27:00Z" };
    expect(nudgeRetryText(nudgeRetry(legacy, now), now)).toBe("Nudge again in 4 h 54 min");
    // 0013's wording, no detail.
    expect(nudgeRetry({ message: "You can nudge them again in 0:30" }, now)).toEqual({ state: "cooldown", at: now + 30_000 });
    const cap = { message: "Daily nudge limit reached · try again tomorrow", details: "retry_at=2026-10-07T05:12:08Z" };
    expect(nudgeRetry(cap, now)).toEqual({ state: "cap", at: Date.parse("2026-10-07T05:12:08Z") });
    expect(nudgeRetryText(nudgeRetry({ message: "Daily nudge limit reached" }, now), now)).toBe(DAILY_CAP_TEXT);
    for (const e of [fresh, legacy, cap]) expect(nudgeRetryText(nudgeRetry(e, now), now)).not.toMatch(/\d{4}-\d\d-\d\dT/);
    expect(nudgeRetry({ message: "They don't owe you anything right now" }, now)).toBeNull();
    expect(nudgeRetry(null, now)).toBeNull();
  });
});

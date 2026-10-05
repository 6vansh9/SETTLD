import { describe, expect, it } from "vitest";
import { daysText, nudgeAvailability, countdown, NUDGE_TEMPLATES, nudgeText, randomTemplate } from "./nudges";

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

  const rules = { cooldown_seconds: 120, daily_cap: 10, polite_until: 3, cheeky_until: 6 };
  const at = (iso: string) => Date.parse(iso);

  it("2-minute cooldown per person, then ready again", () => {
    const now = at("2026-10-05T12:00:00Z");
    expect(nudgeAvailability([], rules, now)).toEqual({ state: "ready" });
    expect(nudgeAvailability(["2026-10-05T11:58:00Z"], rules, now)).toEqual({ state: "ready" });
    const a = nudgeAvailability(["2026-10-05T11:58:30Z", "2026-10-05T11:40:00Z"], rules, now);
    expect(a).toEqual({ state: "cooldown", at: at("2026-10-05T12:00:30Z") });
    expect(countdown(at("2026-10-05T12:01:42Z"), now)).toBe("1:42");
    expect(countdown(at("2026-10-05T12:00:00.200Z"), now)).toBe("0:01"); // rounds up: never shows 0:00 while blocked
    expect(countdown(now - 5, now)).toBe("0:00");
    expect(countdown(now + 3_725_000, now)).toBe("1:02:05");
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
});

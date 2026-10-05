import { describe, expect, it } from "vitest";
import { daysText, nextNudgeAt, NUDGE_TEMPLATES, nudgeText, randomTemplate, untilText } from "./nudges";

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

  it("24 h cooldown", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    expect(nextNudgeAt(null, now)).toBeNull();
    expect(nextNudgeAt("2026-10-04T11:00:00Z", now)).toBeNull();
    const at = nextNudgeAt("2026-10-05T07:00:00Z", now)!;
    expect(new Date(at).toISOString()).toBe("2026-10-06T07:00:00.000Z");
    expect(untilText(at, now)).toBe("in 19 h");
    expect(untilText(now + 30 * 60000, now)).toBe("in 30 min");
  });
});

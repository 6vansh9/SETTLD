import { describe, expect, it } from "vitest";
import {
  claimShareText,
  friendlyError,
  inviteShareText,
  inviteUrl,
  isSingleEmoji,
  microDate,
  microDay,
  partitionGroups,
  validateName,
  whatsappUrl,
} from "./groups";

describe("validateName", () => {
  it("accepts trimmed names up to 40 characters", () => {
    expect(validateName("Goa Trip")).toBeNull();
    expect(validateName("  Flat 4B  ")).toBeNull();
    expect(validateName("x".repeat(40))).toBeNull();
  });

  it("rejects empty and long names", () => {
    expect(validateName("   ")).toMatch(/can't be empty/);
    expect(validateName("x".repeat(41))).toMatch(/too long/);
    expect(validateName("", "Name")).toBe("Name can't be empty");
  });
});

describe("isSingleEmoji", () => {
  it("accepts single emoji including ZWJ sequences and flags", () => {
    for (const e of ["🏝️", "🍕", "👨‍👩‍👧", "🇮🇳", "❤️", "👍🏽"]) expect(isSingleEmoji(e)).toBe(true);
  });

  it("rejects text, multiple emoji and empty", () => {
    for (const e of ["", "a", "ab", "🍕🍕", "1", "🍕a"]) expect(isSingleEmoji(e)).toBe(false);
  });
});

describe("invite links and share text", () => {
  it("builds join URLs", () => {
    expect(inviteUrl("https://settld.app", "abc123def456")).toBe("https://settld.app/join/abc123def456");
    expect(inviteUrl("http://localhost:3001/", "tok")).toBe("http://localhost:3001/join/tok");
  });

  it("writes WhatsApp-friendly text with the URL last", () => {
    const text = inviteShareText({ name: "GOA TRIP", emoji: "🏝️" }, "https://x/join/t");
    expect(text.startsWith("🏝️ Join GOA TRIP on Settld")).toBe(true);
    expect(text.endsWith("https://x/join/t")).toBe(true);
    expect(claimShareText("Zoya Khan", "GOA TRIP", "u")).toBe(
      "Hey Zoya! Your spot in GOA TRIP on Settld is saved. Tap to claim it: u",
    );
  });

  it("encodes WhatsApp URLs", () => {
    expect(whatsappUrl("Join & split: https://x/join/a?b")).toBe(
      "https://wa.me/?text=Join%20%26%20split%3A%20https%3A%2F%2Fx%2Fjoin%2Fa%3Fb",
    );
  });
});

describe("partitionGroups", () => {
  it("splits archived from active, newest first", () => {
    const g = (id: string, created_at: string, archived_at: string | null = null) => ({ id, created_at, archived_at });
    const { active, archived } = partitionGroups([
      g("old", "2026-01-01T00:00:00Z"),
      g("arch", "2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z"),
      g("new", "2026-09-01T00:00:00Z"),
    ]);
    expect(active.map((x) => x.id)).toEqual(["new", "old"]);
    expect(archived.map((x) => x.id)).toEqual(["arch"]);
  });
});

describe("microDate", () => {
  const now = new Date(2026, 9, 4, 18, 0); // 4 Oct 2026, local
  it("labels today, yesterday, this year and other years", () => {
    expect(microDate(new Date(2026, 9, 4, 9).toISOString(), now)).toBe("TODAY");
    expect(microDate(new Date(2026, 9, 3, 23).toISOString(), now)).toBe("YESTERDAY");
    expect(microDate(new Date(2026, 8, 12).toISOString(), now)).toBe("12 SEP");
    expect(microDate(new Date(2025, 11, 31).toISOString(), now)).toBe("31 DEC 25");
  });
});

describe("friendlyError", () => {
  it("passes through our own RPC messages", () => {
    expect(friendlyError({ message: "You can't remove yourself" })).toBe("You can't remove yourself");
  });

  it("hides raw database errors", () => {
    expect(friendlyError({ message: 'new row violates check constraint "groups_color_check"' })).toBe(
      "Something went wrong. Try again.",
    );
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/offline/);
    expect(friendlyError(null)).toBe("Something went wrong. Try again.");
  });
});

describe("microDay", () => {
  const now = new Date(2026, 9, 4, 23, 30); // late evening, local
  it("treats YYYY-MM-DD as a local calendar day", () => {
    expect(microDay("2026-10-04", now)).toBe("TODAY");
    expect(microDay("2026-10-03", now)).toBe("YESTERDAY");
    expect(microDay("2026-09-12", now)).toBe("12 SEP");
    expect(microDay("2025-12-31", now)).toBe("31 DEC 25");
  });
});

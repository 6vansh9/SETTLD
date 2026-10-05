import { describe, expect, it } from "vitest";
import { bestE164, countryOptions, flag, formatPhone, fromE164, ghostInviteText, smsInviteUrl, toE164, whatsappInviteUrl } from "./phone";

describe("phone formatting", () => {
  it("E.164 from what people type, +91 by default", () => {
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect(toE164("098765-43210")).toBe("+919876543210");
    expect(toE164("(415) 555-0123", "US")).toBe("+14155550123");
    expect(toE164("+44 7911 123456", "IN")).toBe("+447911123456"); // own +code wins
    expect(toE164("07911 123456", "GB")).toBe("+447911123456");
  });
  it("rejects what isn't a phone number", () => {
    for (const bad of ["", "   ", "12345", "98765", "abcdefghij", "+91 12345", "11111111111111111"]) expect(toE164(bad)).toBeNull();
  });
  it("round-trips for editing and displays internationally", () => {
    expect(fromE164("+919876543210")).toEqual({ country: "IN", national: "9876543210" });
    expect(fromE164(null)).toEqual({ country: "IN", national: "" });
    expect(toE164(fromE164("+14155550123").national, fromE164("+14155550123").country)).toBe("+14155550123");
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
  });
  it("contact picker numbers in any format", () => {
    expect(bestE164(["junk", "+91-98765-43210"])).toBe("+919876543210");
    expect(bestE164(["098765 43210"])).toBe("+919876543210");
    expect(bestE164(["123"])).toBeNull();
  });
  it("country picker: India first, flags, dial codes", () => {
    const list = countryOptions();
    expect(list[0]).toMatchObject({ code: "IN", dial: "+91", flag: "🇮🇳" });
    expect(list.find((c) => c.code === "US")?.dial).toBe("+1");
    expect(list.length).toBeGreaterThan(200);
    expect(flag("gb")).toBe("🇬🇧");
  });
});

describe("ghost invites", () => {
  const text = ghostInviteText("Rahul Mehta", "Goa Trip", "https://settld-omega.vercel.app/join/abc");
  it("friendly message with the personal link", () => {
    expect(text).toBe("Hey Rahul, I added you to Goa Trip on Settld so we can split costs. Tap to join: https://settld-omega.vercel.app/join/abc");
  });
  it("WhatsApp: digits only; no number → pick a chat", () => {
    expect(whatsappInviteUrl("+919000011111", "hi there")).toBe("https://wa.me/919000011111?text=hi%20there");
    expect(whatsappInviteUrl(null, "hi")).toBe("https://wa.me/?text=hi");
  });
  it("SMS: iOS uses &body=, Android ?body=", () => {
    expect(smsInviteUrl("+919000011111", "hi & bye", true)).toBe("sms:+919000011111&body=hi%20%26%20bye");
    expect(smsInviteUrl("+919000011111", "hi", false)).toBe("sms:+919000011111?body=hi");
  });
});

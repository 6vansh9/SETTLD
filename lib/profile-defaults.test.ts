import { describe, expect, it } from "vitest";
import { defaultProfileName, normalizeProfile } from "./profile-defaults";

describe("defaultProfileName", () => {
  it("prefers the Google full name, then name", () => {
    expect(defaultProfileName({ full_name: " Vansh Gupta ", name: "V" }, "v@x.com")).toBe("Vansh Gupta");
    expect(defaultProfileName({ full_name: "  ", name: "Aman" }, "a@x.com")).toBe("Aman");
  });

  it("falls back to the email's local part", () => {
    expect(defaultProfileName({}, "rahul.mehta@gmail.com")).toBe("rahul.mehta");
    expect(defaultProfileName(null, "priya@x.com")).toBe("priya");
  });

  it("returns empty when there is nothing to go on", () => {
    expect(defaultProfileName(undefined, undefined)).toBe("");
  });

  it("caps at 40 characters without splitting emoji", () => {
    expect(defaultProfileName({ full_name: "x".repeat(50) }, null)).toHaveLength(40);
    expect([...defaultProfileName({ full_name: "😀".repeat(45) }, null)]).toHaveLength(40);
  });

  it("ignores non-string metadata", () => {
    expect(defaultProfileName({ full_name: 42, name: null }, "k@x.com")).toBe("k");
  });
});

describe("normalizeProfile", () => {
  it("fills a bare backfilled row with defaults", () => {
    expect(normalizeProfile({ id: "u", name: null, avatar_color: null, default_currency: null, onboarded_at: null })).toEqual({
      id: "u",
      name: "",
      avatar_color: "lilac",
      upi_id: null,
      default_currency: "INR",
      privacy_blur: false,
      onboarded_at: null,
      avatar_url: null,
      created_at: "",
      updated_at: "",
    });
  });

  it("drops unknown colors/currencies and blank UPI IDs", () => {
    const p = normalizeProfile({ id: "u", avatar_color: "red", default_currency: "JPY", upi_id: "  " });
    expect(p.avatar_color).toBe("lilac");
    expect(p.default_currency).toBe("INR");
    expect(p.upi_id).toBeNull();
  });

  it("keeps valid values", () => {
    const p = normalizeProfile({ id: "u", name: "Vansh", avatar_color: "mint", default_currency: "USD", upi_id: "v@ybl", privacy_blur: true, onboarded_at: "2026-10-04" });
    expect(p).toMatchObject({ name: "Vansh", avatar_color: "mint", default_currency: "USD", upi_id: "v@ybl", privacy_blur: true, onboarded_at: "2026-10-04" });
  });
});

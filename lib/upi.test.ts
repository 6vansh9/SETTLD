import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UPI_ID_PATTERN, buildUpiLink, canPayViaUpi, isValidUpiId, normalizeUpiId } from "./upi";

const migration = (file: string) => readFileSync(path.join(__dirname, "../supabase/migrations", file), "utf8");

describe("UPI ID validation", () => {
  it("accepts common handles", () => {
    for (const id of ["vansh@okhdfcbank", "9876543210@ybl", "aman.rao@paytm", "r_mehta-1@okicici", "me@upi"]) {
      expect(isValidUpiId(id)).toBe(true);
    }
  });

  it("validates the trimmed value (what gets saved)", () => {
    expect(isValidUpiId("  vansh@ybl  ")).toBe(true);
  });

  it("rejects malformed IDs", () => {
    for (const id of ["", "   ", "vansh", "@ybl", "v@", "a@ybl", "vansh@1bank", "vansh@ok hdfc", "va@ns@h", "vansh@ybl\nx", "vañsh@ybl"]) {
      expect(isValidUpiId(id)).toBe(false);
    }
  });

  it("caps the handle at 255 characters (Postgres' regex repeat limit)", () => {
    expect(isValidUpiId(`${"a".repeat(255)}@ybl`)).toBe(true);
    expect(isValidUpiId(`${"a".repeat(256)}@ybl`)).toBe(false);
  });

  it("skip / blank saves null, never an empty string", () => {
    expect(normalizeUpiId("")).toBeNull();
    expect(normalizeUpiId("   ")).toBeNull();
    expect(normalizeUpiId(null)).toBeNull();
    expect(normalizeUpiId(undefined)).toBeNull();
    expect(normalizeUpiId(" vansh@ybl ")).toBe("vansh@ybl");
  });
});

describe("UPI pattern matches the database check constraint", () => {
  it.each(["0001_profiles.sql", "0003_fix_profiles_upi.sql"])("%s uses UPI_ID_PATTERN verbatim", (file) => {
    const sql = migration(file);
    const checks = [...sql.matchAll(/upi_id ~ '([^']+)'/g)].map((m) => m[1]);
    expect(checks.length).toBeGreaterThan(0);
    for (const pattern of checks) expect(pattern).toBe(UPI_ID_PATTERN);
  });

  it("never uses a repeat count above 255 (Postgres rejects it at check time)", () => {
    const counts = [...UPI_ID_PATTERN.matchAll(/\{(\d+)(?:,(\d+))?\}/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean);
    for (const n of counts) expect(Number(n)).toBeLessThanOrEqual(255);
  });
});

describe("buildUpiLink", () => {
  const base = { upiId: "aman@okhdfcbank", name: "Aman Rao", amountMinor: 50000, groupName: "GOA TRIP" };

  it("builds the PRD link with 2-decimal amounts", () => {
    expect(buildUpiLink(base)).toBe("upi://pay?pa=aman@okhdfcbank&pn=Aman%20Rao&am=500.00&cu=INR&tn=Settld%20GOA%20TRIP");
  });

  it("always uses 2 decimals, including paise", () => {
    expect(buildUpiLink({ ...base, amountMinor: 1 })).toContain("&am=0.01&");
    expect(buildUpiLink({ ...base, amountMinor: 123405 })).toContain("&am=1234.05&");
    expect(buildUpiLink({ ...base, amountMinor: 12400000 })).toContain("&am=124000.00&");
  });

  it("percent-encodes names and notes (spaces as %20, never +), including & = # ' ( )", () => {
    const link = buildUpiLink({ ...base, name: "Priya & Co's (Flat #4)", groupName: "Rent = 50/50?" });
    expect(link).toContain("pn=Priya%20%26%20Co%27s%20%28Flat%20%234%29&");
    expect(link).toContain("tn=Settld%20Rent%20%3D%2050%2F50%3F");
    expect(link).not.toContain("+");
    const params = new URL(link.replace("upi://", "http://x/")).searchParams;
    expect(params.get("pn")).toBe("Priya & Co's (Flat #4)");
    expect(params.get("tn")).toBe("Settld Rent = 50/50?");
  });

  it("handles emoji and non-Latin names", () => {
    const params = new URL(buildUpiLink({ ...base, name: "राहुल", groupName: "🏝️ Goa" }).replace("upi://", "http://x/")).searchParams;
    expect(params.get("pn")).toBe("राहुल");
    expect(params.get("tn")).toBe("Settld 🏝️ Goa");
  });

  it("keeps the note short", () => {
    const params = new URL(buildUpiLink({ ...base, groupName: "x".repeat(200) }).replace("upi://", "http://x/")).searchParams;
    expect([...params.get("tn")!].length).toBeLessThanOrEqual(50);
  });

  it("rejects invalid IDs and amounts", () => {
    expect(() => buildUpiLink({ ...base, upiId: "nope" })).toThrow();
    expect(() => buildUpiLink({ ...base, amountMinor: 0 })).toThrow();
    expect(() => buildUpiLink({ ...base, amountMinor: 1.5 })).toThrow();
  });
});

describe("canPayViaUpi", () => {
  it("INR groups with a valid receiver UPI ID only", () => {
    expect(canPayViaUpi("INR", "aman@ybl")).toBe(true);
    expect(canPayViaUpi("USD", "aman@ybl")).toBe(false);
    expect(canPayViaUpi("INR", null)).toBe(false);
    expect(canPayViaUpi("INR", "bad")).toBe(false);
  });
});

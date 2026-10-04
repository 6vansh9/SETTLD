import { describe, expect, it } from "vitest";
import { FX_TTL_MS, chooseQuote, isFresh, parseFrankfurter, parsePair } from "./fx-cache";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("isFresh", () => {
  it("is fresh for 6 hours", () => {
    expect(isFresh(ago(FX_TTL_MS - 1000), NOW)).toBe(true);
    expect(isFresh(ago(FX_TTL_MS + 1000), NOW)).toBe(false);
    expect(isFresh("garbage", NOW)).toBe(false);
  });
});

describe("parseFrankfurter", () => {
  it("reads the quote rate canonically", () => {
    expect(parseFrankfurter({ amount: 1, base: "USD", rates: { INR: 96.32, EUR: 0.89087 } }, "INR")).toBe("96.32");
    expect(parseFrankfurter({ rates: { INR: 0.0104 } }, "INR")).toBe("0.0104");
    expect(parseFrankfurter({ rates: { INR: 1.2e-5 } }, "INR")).toBe("0.000012");
  });

  it("rejects missing or bad values", () => {
    expect(parseFrankfurter({ rates: {} }, "INR")).toBeNull();
    expect(parseFrankfurter({ rates: { INR: "96" } }, "INR")).toBeNull();
    expect(parseFrankfurter({ rates: { INR: 0 } }, "INR")).toBeNull();
    expect(parseFrankfurter(null, "INR")).toBeNull();
  });
});

describe("chooseQuote", () => {
  const live = (rate: string | null) => () => Promise.resolve(rate);
  const down = () => Promise.reject(new Error("API down"));

  it("same currency is 1", async () => {
    expect(await chooseQuote("INR", "INR", null, down, NOW)).toMatchObject({ rate: "1", source: "identity" });
  });

  it("uses a fresh cache without calling the API", async () => {
    let called = false;
    const q = await chooseQuote("USD", "INR", { rate: "96.320000", fetched_at: ago(1000) }, () => ((called = true), Promise.resolve("1")), NOW);
    expect(q).toMatchObject({ rate: "96.32", source: "cache" });
    expect(called).toBe(false);
  });

  it("refreshes a stale cache from the API", async () => {
    expect(await chooseQuote("USD", "INR", { rate: "90", fetched_at: ago(FX_TTL_MS * 2) }, live("96.32"), NOW)).toMatchObject({
      rate: "96.32",
      source: "live",
    });
  });

  it("falls back to the latest cached rate when the API is down", async () => {
    expect(await chooseQuote("USD", "INR", { rate: "90", fetched_at: ago(FX_TTL_MS * 4) }, down, NOW)).toMatchObject({
      rate: "90",
      source: "stale",
    });
    expect(await chooseQuote("USD", "INR", { rate: "90", fetched_at: ago(FX_TTL_MS * 4) }, live(null), NOW)).toMatchObject({ source: "stale" });
  });

  it("returns null when there is nothing at all", async () => {
    expect(await chooseQuote("USD", "INR", null, down, NOW)).toBeNull();
  });
});

describe("parsePair", () => {
  it("accepts supported currencies only", () => {
    expect(parsePair("USD", "INR")).toEqual({ base: "USD", quote: "INR" });
    expect(parsePair("JPY", "INR")).toBeNull();
    expect(parsePair(undefined, "INR")).toBeNull();
  });
});

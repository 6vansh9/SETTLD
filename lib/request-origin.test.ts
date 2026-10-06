import { describe, expect, it } from "vitest";
import { requestOrigin } from "./request-origin";

const h = (o: Record<string, string>) => new Headers(o);

describe("requestOrigin", () => {
  it("uses the forwarded host the browser used (Vercel)", () => {
    expect(requestOrigin(h({ "x-forwarded-host": "settld00.vercel.app", "x-forwarded-proto": "https" }), "http://localhost:3000/auth/callback")).toBe(
      "https://settld00.vercel.app",
    );
  });

  it("takes the first value of comma-separated headers", () => {
    expect(requestOrigin(h({ "x-forwarded-host": "a.example.com, b.internal", "x-forwarded-proto": "https,http" }), "http://x/")).toBe("https://a.example.com");
  });

  it("falls back to the request URL locally", () => {
    expect(requestOrigin(h({}), "http://192.168.29.234:3001/auth/callback?code=1")).toBe("http://192.168.29.234:3001");
    expect(requestOrigin(h({ "x-forwarded-host": "localhost:3001" }), "http://localhost:3001/x")).toBe("http://localhost:3001");
  });

  it("ignores malformed forwarded hosts (no open redirect)", () => {
    expect(requestOrigin(h({ "x-forwarded-host": "evil.com/@x", "x-forwarded-proto": "https" }), "https://settld00.vercel.app/a")).toBe(
      "https://settld00.vercel.app",
    );
    expect(requestOrigin(h({ "x-forwarded-host": "evil.com", "x-forwarded-proto": "javascript" }), "https://ok.app/a")).toBe("https://ok.app");
  });
});

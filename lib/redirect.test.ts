import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("keeps same-site paths, including invite links", () => {
    expect(safeNext("/join/abc123def456")).toBe("/join/abc123def456");
    expect(safeNext("/g/42?tab=balances")).toBe("/g/42?tab=balances");
  });

  it("rejects external and protocol-relative targets", () => {
    expect(safeNext("https://evil.com")).toBe("/groups");
    expect(safeNext("//evil.com")).toBe("/groups");
    expect(safeNext("/\\evil.com")).toBe("/groups");
    expect(safeNext("javascript:alert(1)")).toBe("/groups");
  });

  it("falls back when missing", () => {
    expect(safeNext(null)).toBe("/groups");
    expect(safeNext(undefined, "/me")).toBe("/me");
  });
});

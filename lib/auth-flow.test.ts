import { describe, expect, it } from "vitest";
import {
  callbackErrorCode,
  clearAppStorage,
  googleSignInOptions,
  isAuthErrorCode,
  normalizeOtp,
  parseOtpType,
  shouldNavigateForUserChange,
  shouldResetForUserChange,
} from "./auth-flow";

const qs = (s: string) => new URLSearchParams(s);

describe("googleSignInOptions", () => {
  it("always asks Google to show the account chooser", () => {
    expect(googleSignInOptions("https://x/auth/callback")).toEqual({
      redirectTo: "https://x/auth/callback",
      queryParams: { prompt: "select_account" },
    });
  });
});

describe("callbackErrorCode", () => {
  it("expired / used links", () => {
    expect(callbackErrorCode(qs("error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"))).toBe("expired");
    expect(callbackErrorCode(qs("error_code=flow_state_expired"))).toBe("expired");
  });

  it("user cancelled at Google", () => {
    expect(callbackErrorCode(qs("error=access_denied"))).toBe("denied");
  });

  it("PKCE verifier missing = opened in another browser", () => {
    expect(callbackErrorCode(qs("code=abc"), { code: "pkce_code_verifier_not_found" })).toBe("other-browser");
    expect(callbackErrorCode(qs("code=abc"), { name: "AuthPKCECodeVerifierMissingError" })).toBe("other-browser");
  });

  it("anything else is generic", () => {
    expect(callbackErrorCode(qs(""), { message: "boom" })).toBe("auth");
    expect(callbackErrorCode(qs(""))).toBe("auth");
  });

  it("known codes only", () => {
    expect(isAuthErrorCode("other-browser")).toBe(true);
    expect(isAuthErrorCode("<script>")).toBe(false);
  });
});

describe("OTP helpers", () => {
  it("parses token_hash link types", () => {
    expect(parseOtpType("email")).toBe("email");
    expect(parseOtpType("magiclink")).toBe("magiclink");
    expect(parseOtpType("sms")).toBeNull();
    expect(parseOtpType(null)).toBeNull();
  });

  it("normalizes typed codes", () => {
    expect(normalizeOtp(" 123 456 ")).toBe("123456");
    expect(normalizeOtp("12345")).toBeNull();
    expect(normalizeOtp("12a456")).toBeNull();
  });
});

describe("shouldResetForUserChange", () => {
  it("first event of the page never resets", () => {
    expect(shouldResetForUserChange(undefined, "u1")).toBe(false);
    expect(shouldResetForUserChange(undefined, null)).toBe(false);
  });

  it("resets on a different user or on sign-out, not on token refresh", () => {
    expect(shouldResetForUserChange("u1", "u2")).toBe(true);
    expect(shouldResetForUserChange("u1", null)).toBe(true);
    expect(shouldResetForUserChange("u1", "u1")).toBe(false);
    expect(shouldResetForUserChange(null, null)).toBe(false);
  });

  it("signing in on a signed-out page resets (clears anything cached while signed out)", () => {
    expect(shouldResetForUserChange(null, "u1")).toBe(true);
  });
});

describe("clearAppStorage", () => {
  it("removes everything except kept device preferences", () => {
    const data = new Map([["settld-theme", "dark"], ["sb-x-auth-token", "t"], ["settld-draft", "d"]]);
    const storage = {
      get length() {
        return data.size;
      },
      key: (i: number) => [...data.keys()][i] ?? null,
      removeItem: (k: string) => void data.delete(k),
    };
    expect(clearAppStorage(storage, ["settld-theme"]).sort()).toEqual(["sb-x-auth-token", "settld-draft"]);
    expect([...data.keys()]).toEqual(["settld-theme"]);
  });
});

describe("shouldNavigateForUserChange", () => {
  it("navigates when a known account is replaced or signed out", () => {
    expect(shouldNavigateForUserChange("u1", "u2")).toBe(true);
    expect(shouldNavigateForUserChange("u1", null)).toBe(true);
  });

  it("doesn't hijack a fresh sign-in or the first event", () => {
    expect(shouldNavigateForUserChange(null, "u1")).toBe(false);
    expect(shouldNavigateForUserChange(undefined, "u1")).toBe(false);
    expect(shouldNavigateForUserChange("u1", "u1")).toBe(false);
  });
});

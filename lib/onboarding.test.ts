import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, missingRequired, nextStep, previousStep, startStep, stepHref, stepsFor, type OnboardingEnv } from "./onboarding";

const android: OnboardingEnv = { standalone: false, push: "supported" };
const iosSafari: OnboardingEnv = { standalone: false, push: "ios-needs-home-screen" };
const iosHome: OnboardingEnv = { standalone: true, push: "supported" };
const saved = { name: "Vansh", hasPhone: true, hasUpi: true };

describe("onboarding steps", () => {
  it("has every step in order", () => {
    expect(ONBOARDING_STEPS).toEqual(["name", "phone", "color", "upi", "currency", "notify", "home"]);
  });

  it("Android / desktop: notifications asked directly, then the Home Screen guide", () => {
    const visited = [];
    for (let s: (typeof ONBOARDING_STEPS)[number] | null = "name"; s; s = nextStep(s, android)) visited.push(s);
    expect(visited).toEqual(["name", "phone", "color", "upi", "currency", "notify", "home"]);
  });

  it("iPhone Safari: no notification step (push needs the Home Screen app); the guide comes last", () => {
    expect(stepsFor(iosSafari)).toEqual(["name", "phone", "color", "upi", "currency", "home"]);
    expect(nextStep("currency", iosSafari)).toBe("home");
  });

  it("Home Screen app: the notification step directly, no guide, finishes after it", () => {
    expect(stepsFor(iosHome)).toEqual(["name", "phone", "color", "upi", "currency", "notify"]);
    expect(nextStep("notify", iosHome)).toBeNull();
  });

  it("no push at all: neither step about notifications", () => {
    expect(stepsFor({ standalone: true, push: "unsupported" })).toEqual(["name", "phone", "color", "upi", "currency"]);
  });

  it("goes back one step, not past the first", () => {
    expect(previousStep("upi", android)).toBe("color");
    expect(previousStep("name", android)).toBeNull();
  });

  it("resumes the step from the URL once a name is saved", () => {
    expect(startStep("currency", saved)).toBe("currency");
    expect(startStep("home", saved)).toBe("home");
  });

  it("never resumes past a required field that isn't saved", () => {
    expect(startStep("currency", { ...saved, hasPhone: false })).toBe("phone");
    expect(startStep("home", { ...saved, hasUpi: false })).toBe("upi");
    expect(startStep("upi", { ...saved, hasUpi: false })).toBe("upi");
    expect(startStep("color", { ...saved, hasUpi: false })).toBe("color");
  });

  it("starts at name for a backfilled profile or a bad step", () => {
    expect(startStep("currency", { ...saved, name: "" })).toBe("name");
    expect(startStep("currency", { ...saved, name: "   " })).toBe("name");
    expect(startStep("bogus", saved)).toBe("name");
    expect(startStep(undefined, saved)).toBe("name");
    expect(startStep(["color"], saved)).toBe("name");
  });

  it("keeps the invite destination in step URLs", () => {
    expect(stepHref("color", "/join/abc123def456")).toBe("/onboarding?step=color&next=%2Fjoin%2Fabc123def456");
  });
});

describe("required before using the app", () => {
  it("phone first, then a UPI ID or the opt-out; unknown phone never blocks", () => {
    expect(missingRequired({ phone: null, upiId: null, upiOptOut: false })).toBe("phone");
    expect(missingRequired({ phone: "+919876543210", upiId: null, upiOptOut: false })).toBe("upi");
    expect(missingRequired({ phone: "+919876543210", upiId: null, upiOptOut: true })).toBeNull();
    expect(missingRequired({ phone: "+919876543210", upiId: "a@okaxis", upiOptOut: false })).toBeNull();
    expect(missingRequired({ phone: undefined, upiId: "a@okaxis", upiOptOut: false })).toBeNull();
  });
});

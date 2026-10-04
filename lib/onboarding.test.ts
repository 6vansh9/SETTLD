import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, nextStep, previousStep, startStep, stepHref, stepsFor } from "./onboarding";

describe("onboarding steps", () => {
  it("has the 5 PRD steps in order", () => {
    expect(ONBOARDING_STEPS).toEqual(["name", "color", "upi", "currency", "home"]);
  });

  it("walks every step in order, then finishes", () => {
    const visited = [];
    for (let s: (typeof ONBOARDING_STEPS)[number] | null = "name"; s; s = nextStep(s, false)) visited.push(s);
    expect(visited).toEqual(["name", "color", "upi", "currency", "home"]);
  });

  it("finishes after currency when installed (no home-screen guide)", () => {
    expect(stepsFor(true)).toEqual(["name", "color", "upi", "currency"]);
    expect(nextStep("currency", true)).toBeNull();
    expect(nextStep("currency", false)).toBe("home");
  });

  it("goes back one step, not past the first", () => {
    expect(previousStep("upi", false)).toBe("color");
    expect(previousStep("name", false)).toBeNull();
  });

  it("resumes the step from the URL once a name is saved", () => {
    expect(startStep("currency", "Vansh")).toBe("currency");
    expect(startStep("home", "Vansh")).toBe("home");
  });

  it("starts at name for a backfilled profile or a bad step", () => {
    expect(startStep("currency", "")).toBe("name");
    expect(startStep("currency", "   ")).toBe("name");
    expect(startStep("bogus", "Vansh")).toBe("name");
    expect(startStep(undefined, "Vansh")).toBe("name");
    expect(startStep(["color"], "Vansh")).toBe("name");
  });

  it("keeps the invite destination in step URLs", () => {
    expect(stepHref("color", "/join/abc123def456")).toBe("/onboarding?step=color&next=%2Fjoin%2Fabc123def456");
  });
});

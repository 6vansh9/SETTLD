export const ONBOARDING_STEPS = ["name", "color", "upi", "currency", "home"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** Steps to show: the Add to Home Screen guide is skipped when already running as the installed app. */
export function stepsFor(standalone: boolean): readonly OnboardingStep[] {
  return standalone ? ONBOARDING_STEPS.filter((s) => s !== "home") : ONBOARDING_STEPS;
}

/**
 * Where to (re)start. The step comes from the URL so a reload resumes in place; without a saved
 * name everything after step 1 is meaningless, so start there.
 */
export function startStep(requested: unknown, savedName: string): OnboardingStep {
  if (!savedName.trim()) return "name";
  return isOnboardingStep(requested) ? requested : "name";
}

/** The step after `step`, or null when `step` is the last one (time to finish). */
export function nextStep(step: OnboardingStep, standalone: boolean): OnboardingStep | null {
  const steps = stepsFor(standalone);
  const i = steps.indexOf(step);
  return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null;
}

export function previousStep(step: OnboardingStep, standalone: boolean): OnboardingStep | null {
  const steps = stepsFor(standalone);
  const i = steps.indexOf(step);
  return i > 0 ? steps[i - 1] : null;
}

/** URL for a step, keeping the post-onboarding destination (e.g. an invite link). */
export function stepHref(step: OnboardingStep, next: string): string {
  return `/onboarding?${new URLSearchParams({ step, next }).toString()}`;
}

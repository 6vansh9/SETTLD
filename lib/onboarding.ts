export const ONBOARDING_STEPS = ["name", "phone", "color", "upi", "currency", "notify", "home"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Where onboarding runs. `push` is lib/push-client's pushSupport(). */
export interface OnboardingEnv {
  standalone: boolean;
  push: "supported" | "ios-needs-home-screen" | "unsupported";
}

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/**
 * Steps to show:
 *  • "notify" only where the browser can push right now: Android, desktop, or the iPhone Home
 *    Screen app. In iPhone Safari push doesn't exist, so the Add to Home Screen guide ends with
 *    "open Settld from your Home Screen to turn on notifications" and the Home Screen app asks
 *    on its first open (RequiredSetup).
 *  • "home" (the Add to Home Screen guide) is skipped when already running as the installed app.
 */
export function stepsFor(env: OnboardingEnv): readonly OnboardingStep[] {
  return ONBOARDING_STEPS.filter((s) => (s === "notify" ? env.push === "supported" : s === "home" ? !env.standalone : true));
}

export interface SavedProfileBits {
  name: string;
  hasPhone: boolean;
  /** A UPI ID, or "I don't use UPI". */
  hasUpi: boolean;
}

/**
 * Where to (re)start. The step comes from the URL so a reload resumes in place, but never past a
 * required field that isn't saved yet: no name → name, no phone → phone, no UPI choice → upi.
 */
export function startStep(requested: unknown, saved: SavedProfileBits): OnboardingStep {
  if (!saved.name.trim()) return "name";
  const step = isOnboardingStep(requested) ? requested : "name";
  const at = ONBOARDING_STEPS.indexOf(step);
  if (!saved.hasPhone && at > ONBOARDING_STEPS.indexOf("phone")) return "phone";
  if (!saved.hasUpi && at > ONBOARDING_STEPS.indexOf("upi")) return "upi";
  return step;
}

/** The step after `step`, or null when `step` is the last one (time to finish). */
export function nextStep(step: OnboardingStep, env: OnboardingEnv): OnboardingStep | null {
  const steps = stepsFor(env);
  const i = steps.indexOf(step);
  return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null;
}

export function previousStep(step: OnboardingStep, env: OnboardingEnv): OnboardingStep | null {
  const steps = stepsFor(env);
  const i = steps.indexOf(step);
  return i > 0 ? steps[i - 1] : null;
}

/** URL for a step, keeping the post-onboarding destination (e.g. an invite link). */
export function stepHref(step: OnboardingStep, next: string): string {
  return `/onboarding?${new URLSearchParams({ step, next }).toString()}`;
}

/**
 * What an onboarded user still has to add before using the app (phone and UPI became required
 * after some people signed up). null = nothing. Unknown (still loading / offline) never blocks.
 */
export function missingRequired(p: { phone: string | null | undefined; upiId: string | null; upiOptOut: boolean }): "phone" | "upi" | null {
  if (p.phone === null) return "phone";
  if (!p.upiId && !p.upiOptOut) return "upi";
  return null;
}

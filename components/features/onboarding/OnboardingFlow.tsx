"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ColorPicker } from "@/components/features/profile/ColorPicker";
import { CurrencyPicker } from "@/components/features/profile/CurrencyPicker";
import { TextField } from "@/components/features/profile/TextField";
import { Avatar, Button, Title } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";
import type { CurrencyCode } from "@/lib/money";
import type { Pastel } from "@/lib/pastels";
import { nextStep, previousStep, stepHref, stepsFor, type OnboardingStep } from "@/lib/onboarding";
import { useUpdateProfile } from "@/lib/queries/profile";
import type { Profile, ProfileUpdate } from "@/lib/supabase/types";
import { isValidUpiId, normalizeUpiId } from "@/lib/upi";
import { HomeScreenGuide, isStandalone } from "./HomeScreenGuide";

const TITLES: Record<OnboardingStep, [string, string]> = {
  name: ["WHAT DO WE", "CALL YOU?"],
  color: ["PICK YOUR", "COLOR"],
  upi: ["YOUR", "UPI ID"],
  currency: ["DEFAULT", "CURRENCY"],
  home: ["ADD TO", "HOME SCREEN"],
};

const SAVE_ERROR = "Couldn't save. Check your connection and try again.";

/**
 * Five steps (PRD › Screens › Onboarding). Each step saves its own field before moving on, the
 * current step lives in the URL so a reload resumes in place, and onboarded_at is written only
 * when the last step completes.
 */
export function OnboardingFlow({
  initialProfile,
  initialStep,
  next,
}: {
  initialProfile: Profile;
  initialStep: OnboardingStep;
  next: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const update = useUpdateProfile();

  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState(initialProfile.name);
  const [color, setColor] = useState<Pastel>(initialProfile.avatar_color);
  const [upi, setUpi] = useState(initialProfile.upi_id ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>(initialProfile.default_currency);
  const [error, setError] = useState<string | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => setStandalone(isStandalone()), []);

  // Keep ?step= in sync (no server round trip) so a reload or app switch resumes here.
  useEffect(() => {
    window.history.replaceState(null, "", stepHref(step, next));
  }, [step, next]);

  const steps = stepsFor(standalone);
  const index = steps.indexOf(step);
  const trimmedName = name.trim();
  const busy = update.isPending || finishing;

  const go = (to: OnboardingStep) => {
    setDirection(steps.indexOf(to) > index ? 1 : -1);
    setError(null);
    setStep(to);
  };

  /** Mark onboarding done and leave. The only place onboarded_at is written. */
  const finish = async () => {
    setError(null);
    setFinishing(true);
    try {
      await update.mutateAsync({ onboarded_at: new Date().toISOString() });
      router.replace(next);
    } catch {
      setFinishing(false);
      setError(SAVE_ERROR);
    }
  };

  /** Save this step's field, then move to the next step (or finish after the last one). */
  const saveAndAdvance = async (patch: ProfileUpdate) => {
    setError(null);
    try {
      await update.mutateAsync(patch);
    } catch {
      setError(SAVE_ERROR);
      return;
    }
    const to = nextStep(step, standalone);
    if (to) go(to);
    else await finish();
  };

  const primary = (): { label: string; disabled?: boolean; onClick: () => void } => {
    const saving = (label: string) => (update.isPending ? "Saving…" : label);
    switch (step) {
      case "name":
        return {
          label: saving("Next"),
          disabled: trimmedName.length === 0 || busy,
          onClick: () => saveAndAdvance({ name: trimmedName }),
        };
      case "color":
        return { label: saving("Next"), disabled: busy, onClick: () => saveAndAdvance({ avatar_color: color }) };
      case "upi":
        return {
          label: saving(upi.trim() ? "Next" : "Skip for now"),
          disabled: busy,
          onClick: () => {
            if (upi.trim() && !isValidUpiId(upi)) {
              setError("UPI IDs look like name@bank, e.g. vansh@okhdfcbank.");
              return;
            }
            // Skip (blank) saves null, never "".
            saveAndAdvance({ upi_id: normalizeUpiId(upi) });
          },
        };
      case "currency":
        return {
          label: saving(standalone ? "Finish" : "Next"),
          disabled: busy,
          onClick: () => saveAndAdvance({ default_currency: currency }),
        };
      case "home":
        return { label: finishing ? "Finishing…" : "Let's go", disabled: busy, onClick: finish };
    }
  };
  const cta = primary();
  const [line1, line2] = TITLES[step];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex h-11 items-center justify-between">
        {previousStep(step, standalone) && step !== "home" ? (
          <button
            type="button"
            onClick={() => go(previousStep(step, standalone)!)}
            aria-label="Back"
            className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-ink/5"
          >
            <ArrowLeft className="size-5" strokeWidth={2.25} />
          </button>
        ) : (
          <span className="micro">Settld</span>
        )}
        <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <span
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-6 bg-ink" : i < index ? "w-1.5 bg-ink" : "w-1.5 bg-ink/15",
              )}
            />
          ))}
        </div>
      </header>

      {/*
        Enter-only transition. An AnimatePresence mode="wait" exit here could hang forever when the
        outgoing step had a running layoutId animation (the color picker ring), leaving the old step
        on screen while the state had already moved on.
      */}
      <motion.section
        key={step}
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40 * direction }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduce ? fade : spring}
        className="mt-8 flex flex-1 flex-col"
      >
        <Title line1={line1} line2={line2} size="lg" />

        <div className="mt-8 flex-1">
          {step === "name" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!cta.disabled) cta.onClick();
              }}
            >
              <TextField
                label="Your name"
                large
                autoFocus
                autoComplete="given-name"
                maxLength={40}
                placeholder="Vansh"
                value={name}
                onChange={(e) => setName(e.target.value)}
                hint="Friends see this in groups and on receipts."
              />
            </form>
          )}

          {step === "color" && (
            <>
              <div className="mb-8 flex justify-center">
                <Avatar name={trimmedName} color={color} size="lg" className="size-24 text-[32px]" />
              </div>
              <ColorPicker name={trimmedName} value={color} onChange={setColor} />
            </>
          )}

          {step === "upi" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                cta.onClick();
              }}
            >
              <TextField
                label="UPI ID (optional)"
                autoFocus
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="name@okhdfcbank"
                value={upi}
                onChange={(e) => {
                  setUpi(e.target.value);
                  setError(null);
                }}
                error={error}
                hint="So friends can pay you back in one tap via GPay, PhonePe or Paytm."
              />
            </form>
          )}

          {step === "currency" && <CurrencyPicker value={currency} onChange={setCurrency} />}

          {step === "home" && <HomeScreenGuide />}
        </div>
      </motion.section>

      {error && step !== "upi" && (
        <p role="alert" className="mb-3 text-center text-[14px] font-medium text-owe">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <Button fullWidth disabled={cta.disabled} onClick={cta.onClick}>
          {cta.label}
        </Button>
        {step === "home" && (
          <Button variant="ghost" fullWidth onClick={finish} disabled={busy}>
            I&apos;ll do it later
          </Button>
        )}
      </div>
    </main>
  );
}

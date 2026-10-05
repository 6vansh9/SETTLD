"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { detectPlatform, type Platform } from "@/components/features/onboarding/HomeScreenGuide";
import { friendlyError } from "@/lib/groups";
import { enablePush, PUSH_STEP_DONE_KEY } from "@/lib/push-client";

const REENABLE: Record<Platform, string> = {
  ios: "Open the Settings app › Notifications › Settld › turn on Allow Notifications.",
  android: "Long-press the Settld icon › App info › Notifications › Allow. In Chrome: tap ⓘ next to the address › Notifications.",
  desktop: "Click the icon left of the address bar › Notifications › Allow, then reload.",
};

export function markPushStepDone() {
  try {
    localStorage.setItem(PUSH_STEP_DONE_KEY, "1");
  } catch {
    // storage unavailable: RequiredSetup won't show the card again this session anyway
  }
}

/**
 * "Turn on notifications": the browser prompt only ever comes from the big button's tap. Denied
 * → how to turn them back on in Settings, then Continue (never asks again by itself).
 */
export function NotificationPermission({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "denied" | "on">("idle");
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>("ios");

  useEffect(() => {
    setPlatform(detectPlatform());
    if (typeof Notification !== "undefined" && Notification.permission === "denied") setState("denied");
  }, []);

  const done = () => {
    markPushStepDone();
    onDone();
  };

  const turnOn = async () => {
    setError(null);
    setState("busy");
    try {
      const s = await enablePush(); // requestPermission() runs first, inside this tap
      if (s === "on") {
        setState("on");
        markPushStepDone();
        setTimeout(onDone, 700);
      } else setState(s === "denied" ? "denied" : "idle");
    } catch (e) {
      setError(friendlyError(e));
      setState("idle");
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="flex size-24 items-center justify-center rounded-full bg-coral text-on-pastel">
          <BellRing className="size-11" strokeWidth={2.25} aria-hidden />
        </span>
        {state === "denied" ? (
          <>
            <p className="mt-6 text-[17px] font-semibold">Notifications are off</p>
            <p className="mt-2 max-w-[300px] text-[15px] font-medium text-ink/70">You can turn them on any time: {REENABLE[platform]}</p>
          </>
        ) : state === "on" ? (
          <p className="mt-6 text-[17px] font-semibold" role="status">
            You&apos;re all set ✓
          </p>
        ) : (
          <p className="mt-6 max-w-[300px] text-[15px] font-medium text-ink/70">
            Get a ping when friends add an expense with you, pay you back, or nudge you. Nothing else.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[14px] font-medium text-owe-ink">
            {error}
          </p>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {state === "denied" ? (
          <Button fullWidth onClick={done}>
            Continue
          </Button>
        ) : (
          <>
            <Button fullWidth className="h-16 text-[22px]" disabled={state !== "idle"} onClick={turnOn}>
              <BellRing className="size-6" />
              {state === "busy" ? "Waiting…" : state === "on" ? "On" : "Turn on notifications"}
            </Button>
            <Button variant="ghost" fullWidth disabled={state === "busy" || state === "on"} onClick={done}>
              Not now
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

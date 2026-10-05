"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MoreVertical, Plus, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export type Platform = "ios" | "android" | "desktop";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STEPS: Record<Platform, { title: string; body: string }[]> = {
  ios: [
    { title: "Tap Share", body: "The square with an arrow in Safari's toolbar (on newer iPhones, under ••• next to the address)." },
    { title: "Add to Home Screen", body: "Scroll the share sheet (tap View More if it's hidden), then Add." },
    { title: "Open from your home screen", body: "Settld goes full-screen, and notifications work." },
  ],
  android: [
    { title: "Open the menu", body: "The three dots in Chrome's top-right corner." },
    { title: "Install app", body: "Or “Add to Home screen” on some phones." },
    { title: "Open from your home screen", body: "Settld goes full-screen, like an app." },
  ],
  desktop: [
    { title: "Open Settld on your phone", body: "It's built for your pocket." },
    { title: "Add it to your home screen", body: "Safari: Share › Add to Home Screen. Chrome: ⋮ › Install app." },
    { title: "Or install it here", body: "Look for the install icon in your browser's address bar." },
  ],
};

const STAGE_MS = 2200;

/** Animated walkthrough of adding Settld to the home screen (PRD: required for iOS push). */
export function HomeScreenGuide() {
  const [platform, setPlatform] = useState<Platform>("ios");
  const [stage, setStage] = useState(0);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => setPlatform(detectPlatform()), []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStage((s) => (s + 1) % 3), STAGE_MS);
    return () => clearInterval(t);
  }, [reduce]);

  const steps = STEPS[platform];

  return (
    <div className="flex flex-col items-center">
      <PhoneMock platform={platform} stage={reduce ? 2 : stage} />

      <ol className="mt-8 w-full space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cn(
              "flex gap-4 rounded-[20px] border-[1.5px] p-4 transition-colors duration-300",
              !reduce && stage === i ? "border-ink bg-surface" : "border-ink/[0.08]",
            )}
          >
            <span className="font-num text-[32px] leading-none text-ink-faded">{i + 1}</span>
            <span>
              <span className="block text-[15px] font-semibold">{step.title}</span>
              <span className="mt-0.5 block text-[13px] font-medium text-ink/60">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>

      {installEvent && (
        <button
          type="button"
          onClick={async () => {
            await installEvent.prompt();
            setInstallEvent(null);
          }}
          className="mt-4 h-12 w-full rounded-full bg-ink text-[15px] font-semibold text-bg"
        >
          Install Settld
        </button>
      )}
    </div>
  );
}

/** A tiny phone that loops: tap share → share sheet → icon lands on the home screen. */
function PhoneMock({ platform, stage }: { platform: Platform; stage: number }) {
  const ios = platform !== "android";

  return (
    <div
      aria-hidden
      className="relative h-[300px] w-[164px] overflow-hidden rounded-[32px] border-[5px] border-ink bg-bg"
    >
      {/* Home screen (stage 2) */}
      <AnimatePresence>
        {stage === 2 && (
          <motion.div
            className="absolute inset-0 grid grid-cols-4 content-start gap-2.5 bg-gradient-to-b from-lilac to-sky p-3 pt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i} className="aspect-square rounded-[8px] bg-white/50" />
            ))}
            <motion.span
              className="flex aspect-square items-center justify-center rounded-[8px] bg-coral font-display text-[13px] text-on-pastel"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.25, 1] }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              S
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Browser page (stages 0–1) */}
      {stage < 2 && (
        <div className="absolute inset-0 flex flex-col">
          {!ios && (
            <div className="flex h-8 items-center justify-end border-b border-ink/10 px-2">
              <TapTarget active={stage === 0}>
                <MoreVertical className="size-4" />
              </TapTarget>
            </div>
          )}
          <div className="flex-1 space-y-1.5 p-3 pt-6">
            <p className="font-display text-[28px] uppercase leading-[0.9]">Settld</p>
            <p className="font-display text-[28px] uppercase leading-[0.9] text-ink-faded">Groups</p>
            <div className="!mt-3 h-10 rounded-[10px] bg-pink" />
            <div className="h-10 rounded-[10px] bg-mint" />
          </div>
          {ios && (
            <div className="flex h-9 items-center justify-around border-t border-ink/10 bg-surface">
              <span className="size-2 rounded-full bg-ink/20" />
              <TapTarget active={stage === 0}>
                <Share className="size-4" />
              </TapTarget>
              <span className="size-2 rounded-full bg-ink/20" />
            </div>
          )}
        </div>
      )}

      {/* Share sheet / menu (stage 1) */}
      <AnimatePresence>
        {stage === 1 && (
          <motion.div
            className={cn(
              "absolute inset-x-0 space-y-1 bg-surface p-2 shadow-[0_-1px_0_rgb(var(--ink-rgb)/0.1)]",
              ios ? "bottom-0 rounded-t-[16px] pb-3" : "right-1 top-1 left-auto w-[120px] rounded-[10px]",
            )}
            initial={ios ? { y: "100%" } : { opacity: 0, scale: 0.9 }}
            animate={ios ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={ios ? { y: "100%" } : { opacity: 0 }}
            transition={spring}
          >
            {["Copy", "Bookmark"].map((t) => (
              <div key={t} className="rounded-[6px] px-2 py-1.5 text-[9px] font-semibold text-ink/60">
                {t}
              </div>
            ))}
            <motion.div
              className="flex items-center justify-between rounded-[6px] bg-ink px-2 py-1.5 text-[9px] font-semibold text-bg"
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              {ios ? "Add to Home Screen" : "Install app"}
              <Plus className="size-3" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TapTarget({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className="relative flex size-6 items-center justify-center text-sky">
      {active && (
        <motion.span
          className="absolute inset-0 rounded-full bg-coral/40"
          initial={{ scale: 0.6, opacity: 0.9 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      {children}
    </span>
  );
}

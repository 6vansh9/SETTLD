"use client";

import { useEffect, useRef } from "react";
import { useProfile } from "@/lib/queries/profile";
import { usePrivacy } from "./PrivacyProvider";

/** Back after this long in the background counts as opening the app again (Home Screen apps resume). */
export const REOPEN_AFTER_MS = 10 * 60 * 1000;

/**
 * "Blur amounts on open" (profile setting): blur on app open, and again whenever the app comes
 * back after a while in the background. The eye toggle still works freely in between.
 */
export function ProfileSync() {
  const { data: profile } = useProfile();
  const { setBlurred } = usePrivacy();
  const applied = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  const blurOnOpen = !!profile?.privacy_blur;

  useEffect(() => {
    if (applied.current || !profile) return;
    applied.current = true;
    if (profile.privacy_blur) setBlurred(true);
  }, [profile, setBlurred]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current !== null) {
        const away = Date.now() - hiddenAt.current;
        hiddenAt.current = null;
        if (blurOnOpen && away >= REOPEN_AFTER_MS) setBlurred(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [blurOnOpen, setBlurred]);

  return null;
}

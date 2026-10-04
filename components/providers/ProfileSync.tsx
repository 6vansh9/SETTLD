"use client";

import { useEffect, useRef } from "react";
import { useProfile } from "@/lib/queries/profile";
import { usePrivacy } from "./PrivacyProvider";

/** On app open, apply the profile's "blur amounts by default" setting once. */
export function ProfileSync() {
  const { data: profile } = useProfile();
  const { setBlurred } = usePrivacy();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !profile) return;
    applied.current = true;
    if (profile.privacy_blur) setBlurred(true);
  }, [profile, setBlurred]);

  return null;
}

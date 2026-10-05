"use client";

import { useEffect, useState } from "react";
import { useMyPhone } from "@/lib/queries/phone";
import { PhoneSheet } from "./PhoneSheet";

export const PHONE_LATER_KEY = "settld-phone-later";

/**
 * Existing users without a phone: one prompt on the next app open, with "Later" (then never
 * again on this device; the number can always be added on /me).
 */
export function PhonePrompt() {
  const { data: phone, isSuccess } = useMyPhone();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isSuccess || phone) return;
    let later = false;
    try {
      later = localStorage.getItem(PHONE_LATER_KEY) === "1";
    } catch {
      later = true; // can't remember a "Later": don't nag
    }
    if (!later) setOpen(true);
  }, [isSuccess, phone]);

  const dismiss = () => {
    try {
      localStorage.setItem(PHONE_LATER_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  return (
    <PhoneSheet
      open={open}
      onClose={dismiss}
      current={null}
      title="Add your number"
      intro="So friends who add you by phone can invite you straight in. It stays private: nobody in your groups sees it."
      laterLabel="Later"
      onLater={dismiss}
    />
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { alreadyAsked, enablePush, PUSH_ASKED_KEY, pushSupport } from "@/lib/push-client";

/**
 * After my first expense, one gentle offer (PRD: re-prompt after the first expense). The browser
 * permission prompt only ever comes from the toast's button tap. Shown once per device.
 */
export function usePushPrompt() {
  const { show } = useToast();
  const router = useRouter();
  return useCallback(() => {
    if (typeof window === "undefined" || alreadyAsked()) return;
    const support = pushSupport();
    if (support === "unsupported") return;
    if (support === "supported" && Notification.permission !== "default") return;
    try {
      localStorage.setItem(PUSH_ASKED_KEY, "1");
    } catch {
      return;
    }
    if (support === "ios-needs-home-screen") {
      show({
        message: "Want a ping when friends add expenses or pay you? Add Settld to your Home Screen first.",
        duration: 9000,
        action: { label: "How", onClick: () => router.push("/me#notifications") },
      });
      return;
    }
    show({
      message: "Want a ping when friends add expenses or pay you?",
      duration: 9000,
      action: { label: "Turn on", onClick: () => void enablePush().catch(() => undefined) },
    });
  }, [show, router]);
}

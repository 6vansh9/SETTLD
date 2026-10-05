"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { CommandBarProvider } from "@/components/features/command-bar/CommandBarProvider";
import { PushBridge } from "@/components/features/push/PushBridge";
import { RequiredSetup } from "@/components/features/profile/RequiredSetup";
import { AppShell } from "@/components/providers/AppShell";
import { AuthSync } from "@/components/providers/AuthSync";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { ProfileSync } from "@/components/providers/ProfileSync";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000 },
          // Always run mutations: offline, the money writes go to the IndexedDB queue themselves
          // (lib/offline). TanStack's default would pause them in memory, lost on reload.
          mutations: { networkMode: "always" },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PrivacyProvider>
          <AuthSync />
          <ProfileSync />
          <PushBridge />
          {/* "user": Framer Motion drops transform animations when prefers-reduced-motion is set */}
          <MotionConfig reducedMotion="user">
            <ToastProvider>
              <AppShell />
              <RequiredSetup />
              <CommandBarProvider>{children}</CommandBarProvider>
            </ToastProvider>
          </MotionConfig>
        </PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

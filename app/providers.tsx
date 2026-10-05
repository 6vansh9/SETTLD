"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { CommandBarProvider } from "@/components/features/command-bar/CommandBarProvider";
import { PushBridge } from "@/components/features/push/PushBridge";
import { AuthSync } from "@/components/providers/AuthSync";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { ProfileSync } from "@/components/providers/ProfileSync";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
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
              <CommandBarProvider>{children}</CommandBarProvider>
            </ToastProvider>
          </MotionConfig>
        </PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { ProfileSync } from "@/components/providers/ProfileSync";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PrivacyProvider>
          <ProfileSync />
          {/* "user": Framer Motion drops transform animations when prefers-reduced-motion is set */}
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

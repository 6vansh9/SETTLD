"use client";

import type { QueryClient } from "@tanstack/react-query";
import { THEME_STORAGE_KEY } from "@/components/providers/ThemeProvider";
import { clearAppStorage } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/client";

/**
 * Forget everything about the previous account on this device: the whole TanStack Query cache and
 * all app data in localStorage/sessionStorage. The theme is a device preference and survives.
 * (Privacy blur and other React state reset with the hard navigation that follows.)
 */
export function resetClientState(queryClient: QueryClient) {
  queryClient.clear();
  try {
    clearAppStorage(window.localStorage, [THEME_STORAGE_KEY]);
  } catch {
    // Storage unavailable (private mode): nothing to clear.
  }
  try {
    clearAppStorage(window.sessionStorage);
  } catch {
    // ditto
  }
}

/** Sign out, wipe client state, and hard-navigate so no old data survives in memory. */
export async function signOutAndReset(queryClient: QueryClient) {
  await createClient().auth.signOut();
  resetClientState(queryClient);
  window.location.replace("/");
}

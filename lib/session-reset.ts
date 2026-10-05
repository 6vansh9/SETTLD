"use client";

import type { QueryClient } from "@tanstack/react-query";
import { THEME_STORAGE_KEY } from "@/components/providers/ThemeProvider";
import { clearAppStorage } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/client";
import { clearDataCaches } from "@/lib/sw-client";

/**
 * Forget everything about the previous account on this device: the whole TanStack Query cache and
 * all app data in localStorage/sessionStorage, and the service worker's saved pages. The theme is a
 * device preference and survives. (The offline queue in IndexedDB is per user and is kept: it is
 * unsent data, and it syncs when that person signs in again.)
 * (Privacy blur and other React state reset with the hard navigation that follows.)
 */
export function resetClientState(queryClient: QueryClient) {
  queryClient.clear();
  void clearDataCaches();
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
  await clearDataCaches();
  window.location.replace("/");
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { shouldNavigateForUserChange, shouldResetForUserChange } from "@/lib/auth-flow";
import { resetClientState } from "@/lib/session-reset";
import { createClient } from "@/lib/supabase/client";
import { usePrivacy } from "./PrivacyProvider";

/**
 * Account switching safety: whenever the signed-in user changes (sign-out, a different account,
 * or a sign-in/out in another tab), drop every cached query and app storage and the privacy-blur
 * state. If a known account was replaced or signed out, hard-navigate so nothing from the old
 * account stays rendered.
 */
export function AuthSync() {
  const queryClient = useQueryClient();
  const { setBlurred } = usePrivacy();
  const known = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();

    const handle = (userId: string | null) => {
      const previous = known.current;
      known.current = userId;
      if (!shouldResetForUserChange(previous, userId)) return;
      setBlurred(false);
      resetClientState(queryClient);
      if (shouldNavigateForUserChange(previous, userId)) window.location.replace(userId ? "/groups" : "/");
    };

    // INITIAL_SESSION tells us who this page belongs to; later events are compared against it.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => handle(session?.user.id ?? null));

    // Another tab may have signed in/out (cookie changed without an event here): re-check on return.
    const recheck = async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.auth.getSession();
      handle(data.session?.user.id ?? null);
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [queryClient, setBlurred]);

  return null;
}

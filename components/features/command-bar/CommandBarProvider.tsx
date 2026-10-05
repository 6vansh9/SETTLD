"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useGroups } from "@/lib/queries/groups";
import { useProfile } from "@/lib/queries/profile";
import { CommandBar } from "./CommandBar";

const CommandBarContext = createContext<{ open: (groupId?: string | null) => void }>({ open: () => {} });

/** Command bar available everywhere: Cmd/Ctrl+K, the + tab, and a group's + button. Signed-in only. */
export function CommandBarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; groupId: string | null }>({ open: false, groupId: null });
  const { data: profile } = useProfile();
  // Groups load when the bar is first needed (and stay fresh through realtime invalidations).
  const [wanted, setWanted] = useState(false);
  const { data: groups } = useGroups(undefined, wanted && !!profile);

  const open = useCallback((groupId?: string | null) => {
    setWanted(true);
    setState({ open: true, groupId: groupId ?? null });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (!profile?.onboarded_at) return;
        e.preventDefault();
        const g = window.location.pathname.match(/^\/g\/([0-9a-f-]{36})/)?.[1] ?? null;
        open(g);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, profile?.onboarded_at]);

  const value = useMemo(() => ({ open }), [open]);
  return (
    <CommandBarContext.Provider value={value}>
      {children}
      {profile && (
        <CommandBar open={state.open && !!groups} onClose={close} groups={groups ?? []} myUserId={profile.id} initialGroupId={state.groupId} />
      )}
    </CommandBarContext.Provider>
  );
}

export function useCommandBar() {
  return useContext(CommandBarContext);
}

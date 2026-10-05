"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { GroupWithMembers } from "@/lib/groups-data";
import { useGroups } from "@/lib/queries/groups";
import { useProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/client";
import { CommandBar } from "./CommandBar";

const CommandBarContext = createContext<{ open: (groupId?: string | null) => void }>({ open: () => {} });

/** Command bar available everywhere: Cmd/Ctrl+K, the + tab, and a group's + button. Signed-in only. */
export function CommandBarProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ open: boolean; groupId: string | null }>({ open: false, groupId: null });
  const { data: profile } = useProfile();
  // Offline the profile may never load; the locally stored session still says who I am. (Pages
  // that show the bar's entry points are onboarded-only, so a session there means onboarded.)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  useEffect(() => {
    void createClient()
      .auth.getSession()
      .then(({ data }) => setSessionUserId(data.session?.user.id ?? null));
  }, []);
  const myUserId = profile?.id ?? sessionUserId;
  const onboarded = profile ? !!profile.onboarded_at : !!sessionUserId && /^\/(g|groups|activity|me|room)\b/.test(typeof window === "undefined" ? "" : window.location.pathname);
  // Groups load in the background once signed in, so the bar also opens offline (Milestone 9).
  // If the list was never fetched, fall back to any group already in the cache (e.g. this page's).
  const qc = useQueryClient();
  const { data: listed } = useGroups(undefined, !!myUserId);
  const cached = qc
    .getQueriesData<GroupWithMembers | null>({ queryKey: ["group"] })
    .map(([, g]) => g)
    .filter((g): g is GroupWithMembers => !!g && typeof g === "object" && "members" in g && Array.isArray((g as GroupWithMembers).members));
  const groups = listed ?? (cached.length ? cached : undefined);

  const open = useCallback((groupId?: string | null) => {
    setState({ open: true, groupId: groupId ?? null });
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (!onboarded) return;
        e.preventDefault();
        const g = window.location.pathname.match(/^\/g\/([0-9a-f-]{36})/)?.[1] ?? null;
        open(g);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onboarded]);

  const value = useMemo(() => ({ open }), [open]);
  return (
    <CommandBarContext.Provider value={value}>
      {children}
      {myUserId && (
        <CommandBar open={state.open && !!groups} onClose={close} groups={groups ?? []} myUserId={myUserId} initialGroupId={state.groupId} />
      )}
    </CommandBarContext.Provider>
  );
}

export function useCommandBar() {
  return useContext(CommandBarContext);
}

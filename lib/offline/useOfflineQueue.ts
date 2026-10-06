"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/client";
import { loadQueue, snapshot, subscribe } from "./store";
import type { QueueItem } from "./types";

const EMPTY: QueueItem[] = [];

/**
 * This user's queued writes (live), plus counts for the banner. Who "this user" is comes from the
 * profile, or, when that can't load (opened or reloaded offline), from the session stored on the
 * phone, so queued changes still show their "Waiting to sync" badges offline.
 */
export function useOfflineQueue(groupId?: string) {
  const { data: profile } = useProfile();
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  useEffect(() => {
    void loadQueue();
    void createClient()
      .auth.getSession()
      .then(({ data }) => setSessionUserId(data.session?.user.id ?? null))
      .catch(() => undefined);
  }, []);
  const all = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const userId = profile?.id ?? sessionUserId;
  return useMemo(() => {
    const mine = userId ? all.filter((i) => i.userId === userId && (!groupId || i.groupId === groupId)) : EMPTY;
    return {
      userId,
      items: mine,
      pending: mine.filter((i) => i.status === "pending").length,
      failed: mine.filter((i) => i.status === "failed").length,
    };
  }, [all, userId, groupId]);
}

"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useProfile } from "@/lib/queries/profile";
import { loadQueue, snapshot, subscribe } from "./store";
import type { QueueItem } from "./types";

const EMPTY: QueueItem[] = [];

/** This user's queued writes (live), plus counts for the banner. */
export function useOfflineQueue(groupId?: string) {
  const { data: profile } = useProfile();
  useEffect(() => {
    void loadQueue();
  }, []);
  const all = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  return useMemo(() => {
    const mine = profile ? all.filter((i) => i.userId === profile.id && (!groupId || i.groupId === groupId)) : EMPTY;
    return {
      userId: profile?.id ?? null,
      items: mine,
      pending: mine.filter((i) => i.status === "pending").length,
      failed: mine.filter((i) => i.status === "failed").length,
    };
  }, [all, profile, groupId]);
}

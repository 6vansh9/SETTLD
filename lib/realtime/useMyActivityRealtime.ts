"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { expenseKeys } from "@/lib/queries/expenses";
import { groupKeys } from "@/lib/queries/groups";
import { createClient } from "@/lib/supabase/client";

const BATCH_MS = 150;
/** postgres_changes `in` filters accept up to 100 values; beyond that RLS alone scopes the feed. */
const MAX_IN_FILTER = 100;

/**
 * /groups and /activity: one subscription to activity rows across all my groups
 * (filter group_id=in.(…)). Any new activity refreshes group cards, Home balances and the feed.
 */
export function useMyActivityRealtime(groupIds: string[], userId: string) {
  const qc = useQueryClient();
  const key = [...groupIds].sort().join(",");

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let wasLive = false;

    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void qc.invalidateQueries({ queryKey: groupKeys.all });
        void qc.invalidateQueries({ queryKey: expenseKeys.allBalances });
        void qc.invalidateQueries({ queryKey: ["activity"] });
      }, BATCH_MS);
    };

    const channel = supabase
      .channel(`activity:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity",
          ...(ids.length <= MAX_IN_FILTER ? { filter: `group_id=in.(${ids.join(",")})` } : {}),
        },
        refresh,
      )
      // New group backgrounds and profile photos (RLS: only my groups / people I share one with).
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "groups", ...(ids.length <= MAX_IN_FILTER ? { filter: `id=in.(${ids.join(",")})` } : {}) },
        refresh,
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, refresh)
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          if (wasLive) refresh();
          wasLive = true;
        }
      });

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      void supabase.removeChannel(channel);
    };
  }, [key, userId, qc]);
}

"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityRow } from "@/lib/activity";
import { createThrottle, type PresenceScreen, type PresenceState } from "@/lib/presence";
import { expenseKeys } from "@/lib/queries/expenses";
import { groupKeys } from "@/lib/queries/groups";
import { settlementKeys } from "@/lib/queries/settlements";
import { pendingWrites } from "@/lib/realtime/pending";
import { createClient } from "@/lib/supabase/client";

/** Batch the burst of events one write produces (row + activity) into a single refetch. */
const BATCH_MS = 120;
const FOCUS_REFETCH_MIN_MS = 2000;
export const REALTIME_DEBUG_KEY = "settld-debug-realtime";

export type RealtimeStatus = "connecting" | "live" | "reconnecting";

type Row = Record<string, unknown> & { id?: string; client_id?: string | null };

/** Opt-in latency log: localStorage.setItem("settld-debug-realtime", "1"). */
function debugLatency(table: string, payload: RealtimePostgresChangesPayload<Row>) {
  try {
    if (localStorage.getItem(REALTIME_DEBUG_KEY) !== "1") return;
  } catch {
    return;
  }
  const committed = Date.parse(payload.commit_timestamp);
  console.info(`[realtime] ${table} ${payload.eventType} received ${Number.isFinite(committed) ? Date.now() - committed : "?"} ms after commit`);
}

/**
 * Live sync for one open group (PRD › Realtime architecture):
 *  • private channel "group:<id>" with postgres_changes on expenses, settlements, activity and
 *    group_members (filtered by group_id; RLS limits rows to members);
 *  • on any change: invalidate that group's lists and re-read group_balances (never rebuilt from events);
 *  • events for my own in-flight writes (client_id / row id) are ignored: the mutation owns those;
 *  • on reconnect, focus, visibility or coming back online: refetch the whole group;
 *  • Presence { member_id, typing, screen }, throttled to one update per second.
 */
export function useGroupRealtime(
  groupId: string,
  myMemberId: string,
  onActivity: (row: ActivityRow) => void,
): { status: RealtimeStatus; presence: PresenceState[]; setScreen: (screen: PresenceScreen) => void } {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [presence, setPresence] = useState<PresenceState[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  const screenRef = useRef<PresenceScreen>("group");
  const tracker = useRef<ReturnType<typeof createThrottle<PresenceState>> | null>(null);
  const joined = useRef(false);

  useEffect(() => {
    if (!groupId || !myMemberId) return; // not (or no longer) a member: nothing to subscribe to
    const supabase = createClient();
    let disposed = false;
    let wasLive = false;
    let lastRefetch = 0;
    const dirty = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (dirty.has("expenses")) void qc.invalidateQueries({ queryKey: expenseKeys.list(groupId) });
      if (dirty.has("settlements")) void qc.invalidateQueries({ queryKey: settlementKeys.list(groupId) });
      if (dirty.has("members")) void qc.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
      if (dirty.has("activity")) void qc.invalidateQueries({ queryKey: ["group", groupId, "activity"] });
      // Any change can move money: always re-read the balances view (and Home's).
      void qc.invalidateQueries({ queryKey: expenseKeys.balances(groupId) });
      void qc.invalidateQueries({ queryKey: expenseKeys.allBalances });
      void qc.invalidateQueries({ queryKey: groupKeys.all });
      dirty.clear();
    };
    const mark = (what: string) => {
      dirty.add(what);
      if (!timer) timer = setTimeout(flush, BATCH_MS);
    };
    const refetchAll = () => {
      const now = Date.now();
      if (now - lastRefetch < FOCUS_REFETCH_MIN_MS) return;
      lastRefetch = now;
      ["expenses", "settlements", "members", "activity"].forEach(mark);
    };

    const handle = (table: string, what: string) => (payload: RealtimePostgresChangesPayload<Row>) => {
      debugLatency(table, payload);
      const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Row;
      // My own optimistic write coming back: the mutation already put the server row in the cache.
      if (what !== "activity" && pendingWrites.has(row?.client_id ?? null, row?.id ?? null)) return;
      mark(what);
      if (what === "activity" && payload.eventType === "INSERT") {
        const a = payload.new as unknown as ActivityRow;
        if (a.actor_member !== myMemberId) onActivityRef.current(a);
      }
    };

    const filter = `group_id=eq.${groupId}`;
    joined.current = false;
    let channel: RealtimeChannel;

    /**
     * Private "group:<id>" (data + presence). If the private channel is refused before it ever
     * joined (e.g. 0006's Realtime policies aren't installed), fall back to a public channel for
     * the data changes only (RLS still filters every row) and leave presence off.
     */
    const open = (isPrivate: boolean) => {
      let everJoined = false;
      const ch = supabase.channel(isPrivate ? `group:${groupId}` : `group-data:${groupId}`, {
        config: isPrivate ? { private: true, presence: { key: myMemberId } } : {},
      });
      ch.on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter }, handle("expenses", "expenses"))
        .on("postgres_changes", { event: "*", schema: "public", table: "settlements", filter }, handle("settlements", "settlements"))
        .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter }, handle("group_members", "members"))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity", filter }, handle("activity", "activity"));
      if (isPrivate) {
        ch.on("presence", { event: "sync" }, () => setPresence(Object.values(ch.presenceState<PresenceState>()).flat()));
      }
      channel = ch;
      channelRef.current = ch;
      ch.subscribe((s) => {
        if (disposed) return;
        if (s === "SUBSCRIBED") {
          everJoined = true;
          joined.current = isPrivate;
          setStatus("live");
          if (wasLive) refetchAll(); // reconnected: catch up on anything missed while offline
          wasLive = true;
          if (isPrivate) tracker.current?.push({ member_id: myMemberId, typing: screenRef.current !== "group", screen: screenRef.current });
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          joined.current = false;
          if (isPrivate && !everJoined && s === "CHANNEL_ERROR") {
            console.warn("[realtime] private group channel refused; using a data-only channel (presence off)");
            void supabase.removeChannel(ch);
            setPresence([]);
            open(false);
            return;
          }
          setStatus("reconnecting");
        }
      });
    };

    tracker.current = createThrottle<PresenceState>((s) => {
      // Presence can only be sent on a joined private channel; the latest state is re-sent on (re)join.
      if (channelRef.current === channel && joined.current) void channel.track(s);
    }, 1000);

    // Make sure the private channel joins with the signed-in user's token.
    void supabase.realtime.setAuth().finally(() => {
      if (!disposed) open(true);
    });

    const onVisible = () => document.visibilityState === "visible" && refetchAll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refetchAll);
    window.addEventListener("online", refetchAll);

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      tracker.current?.cancel();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refetchAll);
      window.removeEventListener("online", refetchAll);
      const current = channelRef.current;
      channelRef.current = null;
      if (current) void supabase.removeChannel(current); // unsubscribe on leave
    };
  }, [groupId, myMemberId, qc]);

  const setScreen = useCallback(
    (screen: PresenceScreen) => {
      screenRef.current = screen;
      if (joined.current) tracker.current?.push({ member_id: myMemberId, typing: screen !== "group", screen });
    },
    [myMemberId],
  );

  return { status, presence, setScreen };
}

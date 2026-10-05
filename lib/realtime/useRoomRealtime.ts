"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { roomBusy, roomKeys } from "@/lib/queries/rooms";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeStatus } from "./useGroupRealtime";

const BATCH_MS = 120;

/**
 * Live Split Room (PRD › Realtime: one channel per room, "room:<CODE>"):
 *  • postgres_changes on the room row, its items and its claims (filtered by room; RLS = members);
 *  • any change re-reads the room (small), unless one of my taps is still in flight: the tap owns
 *    the cache until it settles, then the room is read once;
 *  • presence { member_id } so everyone sees who's in the room;
 *  • refetch on reconnect / focus. Falls back to a data-only channel if the private join is refused.
 */
export function useRoomRealtime(code: string, roomId: string | null, myMemberId: string | null) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [here, setHere] = useState<string[]>([]);

  useEffect(() => {
    if (!roomId || !myMemberId) return;
    const supabase = createClient();
    let disposed = false;
    let wasLive = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel;

    const refetch = () => {
      timer = null;
      if (roomBusy(qc, code)) return; // the in-flight write re-reads the room when it settles
      void qc.invalidateQueries({ queryKey: roomKeys.room(code) });
    };
    const mark = () => {
      if (!timer) timer = setTimeout(refetch, BATCH_MS);
    };

    const open = (isPrivate: boolean) => {
      let everJoined = false;
      const ch = supabase.channel(isPrivate ? `room:${code}` : `room-data:${code}`, {
        config: isPrivate ? { private: true, presence: { key: myMemberId } } : {},
      });
      ch.on("postgres_changes", { event: "*", schema: "public", table: "split_rooms", filter: `id=eq.${roomId}` }, mark)
        .on("postgres_changes", { event: "*", schema: "public", table: "split_room_items", filter: `room_id=eq.${roomId}` }, mark)
        .on("postgres_changes", { event: "*", schema: "public", table: "split_room_claims", filter: `room_id=eq.${roomId}` }, mark);
      if (isPrivate) {
        ch.on("presence", { event: "sync" }, () => {
          const ids = Object.values(ch.presenceState<{ member_id: string }>())
            .flat()
            .map((p) => p.member_id);
          setHere([...new Set(ids)]);
        });
      }
      channel = ch;
      ch.subscribe((s) => {
        if (disposed) return;
        if (s === "SUBSCRIBED") {
          everJoined = true;
          setStatus("live");
          if (wasLive) mark();
          wasLive = true;
          if (isPrivate) void ch.track({ member_id: myMemberId });
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          if (isPrivate && !everJoined && s === "CHANNEL_ERROR") {
            console.warn("[realtime] private room channel refused; using a data-only channel");
            void supabase.removeChannel(ch);
            open(false);
            return;
          }
          setStatus("reconnecting");
        }
      });
    };
    open(true);

    const onFocus = () => {
      if (document.visibilityState === "visible") mark();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [qc, code, roomId, myMemberId]);

  return { status, here };
}

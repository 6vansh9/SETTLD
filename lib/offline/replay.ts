"use client";

import type { QueryClient } from "@tanstack/react-query";
import { friendlyError } from "@/lib/groups";
import { createClient } from "@/lib/supabase/client";
import { isNetworkError } from "./net";
import { loadQueue, removeItem, snapshot, updateItem } from "./store";
import type { QueueItem } from "./types";

let running: Promise<void> | null = null;

async function send(item: QueueItem): Promise<void> {
  const supabase = createClient();
  // The same arguments as the original call, including client_id: a retry can't duplicate.
  const { error } = await (supabase.rpc as unknown as (fn: string, args: object) => PromiseLike<{ error: unknown }>)(item.kind, item.params);
  if (error) throw error;
}

/**
 * Send this user's pending writes, oldest first. Stops at the first network failure (try again on
 * the next reconnect); a server refusal moves that item to "Couldn't sync" with the reason and
 * carries on with the rest. One run at a time.
 */
export function replayQueue(userId: string, qc: QueryClient): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      await loadQueue();
      for (const item of snapshot().filter((i) => i.userId === userId && i.status === "pending")) {
        try {
          await send(item);
        } catch (err) {
          if (isNetworkError(err)) return;
          await updateItem(item.id, { status: "failed", error: friendlyError(err) });
          continue;
        }
        // Show the server's version before the queued preview disappears (no flicker).
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["group", item.groupId] }),
          qc.invalidateQueries({ queryKey: ["balances"] }),
          qc.invalidateQueries({ queryKey: ["groups"] }),
        ]).catch(() => undefined);
        await removeItem(item.id);
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

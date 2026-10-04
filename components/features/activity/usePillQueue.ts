"use client";

import { useCallback, useEffect, useState } from "react";
import type { PillItem } from "@/components/ui/PresencePill";

export const PILL_MS = 3000;
const MAX_QUEUE = 10;

/**
 * One event at a time (PRD: auto-collapse after 3 s, queued). When no event is showing, a live
 * presence line ("Aman is adding an expense…") takes the pill until they stop.
 */
export function usePillQueue(presenceText: string | null) {
  const [queue, setQueue] = useState<PillItem[]>([]);
  const [current, setCurrent] = useState<PillItem | null>(null);

  const push = useCallback((item: PillItem) => setQueue((q) => [...q, item].slice(-MAX_QUEUE)), []);

  useEffect(() => {
    if (current || queue.length === 0) return;
    setCurrent(queue[0]);
    setQueue((q) => q.slice(1));
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), PILL_MS);
    return () => clearTimeout(t);
  }, [current]);

  const dismiss = useCallback(() => setCurrent(null), []);
  const shown: PillItem | null = current ?? (presenceText ? { key: `presence:${presenceText}`, text: presenceText, live: true } : null);
  return { shown, push, dismiss };
}

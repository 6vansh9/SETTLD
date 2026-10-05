"use client";

import { useCallback } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import type { GroupWithMembers } from "@/lib/groups-data";
import { nudgeText } from "@/lib/nudges";

type Row = { kind: string; group_id: string; actor_member: string | null; payload: Record<string, unknown> };

/**
 * In-app banner when someone nudges me (the push covers the app being closed). Returns a handler
 * for live activity rows; it ignores everything that isn't a nudge to me.
 */
export function useNudgeBanner(myUserId: string, onSettle: (groupId: string) => void) {
  const { show } = useToast();
  return useCallback(
    (row: Row, group: GroupWithMembers | undefined) => {
      if (row.kind !== "nudge_sent" || !group) return;
      const me = group.members.find((m) => m.user_id === myUserId && !m.left_at);
      if (!me || row.payload.to_member !== me.id) return;
      const from = group.members.find((m) => m.id === row.actor_member);
      const n = (k: string) => Number(row.payload[k] ?? 0);
      show({
        message: `${group.emoji} ${nudgeText({
          level: n("level") || 1,
          template: n("template"),
          name: me.display_name,
          from: from?.display_name ?? "Someone",
          amount: n("amount"),
          currency: group.base_currency,
          days: n("days"),
        })}`,
        duration: 10_000,
        action: { label: "Settle up", onClick: () => onSettle(group.id) },
      });
    },
    [myUserId, onSettle, show],
  );
}

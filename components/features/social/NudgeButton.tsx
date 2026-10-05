"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups-data";
import { nextNudgeAt, nudgeText, randomTemplate, untilText } from "@/lib/nudges";
import { useNudges, useSendNudge } from "@/lib/queries/social";

/**
 * Nudge someone who owes me (PRD › Escalating nudges). Hidden for ghosts and when the group has
 * nudges off; disabled with "Next nudge in 5 h" during the 24 h cooldown (the server enforces it too).
 */
export function NudgeButton({
  group,
  myMemberId,
  toMemberId,
  amount,
  className,
}: {
  group: GroupWithMembers;
  myMemberId: string;
  toMemberId: string;
  amount: number;
  className?: string;
}) {
  const { show } = useToast();
  const { data: nudges = [] } = useNudges(group.id);
  const send = useSendNudge(group.id);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const to = group.members.find((m) => m.id === toMemberId);
  const me = group.members.find((m) => m.id === myMemberId);
  if (!to || to.is_ghost || to.left_at || group.nudge_mode === "off" || group.archived_at) return null;

  const last = nudges.find((n) => n.from_member === myMemberId && n.to_member === toMemberId);
  const waitUntil = nextNudgeAt(last?.sent_at, now);
  const disabled = send.isPending || waitUntil !== null;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        send.mutate(
          { toMember: toMemberId, amount, template: randomTemplate() },
          {
            onSuccess: (n) =>
              show({
                message: `Nudged ${to.display_name.split(" ")[0]} (level ${n.level}): “${nudgeText({
                  level: n.level,
                  template: n.template,
                  name: to.display_name,
                  from: me?.display_name ?? "You",
                  amount: n.amount,
                  currency: group.base_currency,
                  days: n.days,
                })}”`,
                duration: 6000,
              }),
            onError: (err) => show({ message: `Couldn't nudge: ${friendlyError(err)}` }),
          },
        )
      }
      title={waitUntil ? "One nudge per person every 24 hours" : undefined}
      aria-label={waitUntil ? `Next nudge allowed ${untilText(waitUntil, now)}` : undefined}
      className={cn(
        "flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-ink/15 px-3 text-[13px] font-semibold text-ink disabled:opacity-50",
        className,
      )}
    >
      <BellRing className="size-4" />
      {send.isPending ? "Nudging…" : waitUntil ? `Again ${untilText(waitUntil, now)}` : "Nudge"}
    </button>
  );
}

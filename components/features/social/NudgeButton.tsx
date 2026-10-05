"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import { friendlyError } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups-data";
import { countdown, nudgeAvailability, nudgeText, randomTemplate } from "@/lib/nudges";
import { useNudgeRules, useNudges, useSendNudge } from "@/lib/queries/social";

/**
 * Nudge someone who owes me (PRD › Escalating nudges). Hidden for ghosts and when the group has
 * nudges off. During the cooldown it counts down live ("Nudge again in 1:42") and re-enables by
 * itself; past the daily cap it says "Daily nudge limit reached". Limits come from the database
 * (nudge_rules), which also enforces them.
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
  const { data: rules } = useNudgeRules();
  const [now, setNow] = useState(() => Date.now());

  const to = group.members.find((m) => m.id === toMemberId);
  const me = group.members.find((m) => m.id === myMemberId);
  const sentAts = nudges.filter((n) => n.from_member === myMemberId && n.to_member === toMemberId).map((n) => n.sent_at);
  const availability = nudgeAvailability(sentAts, rules, now);
  const blocked = availability.state !== "ready";

  // Tick once a second only while blocked, so the countdown is live and the button comes back by itself.
  useEffect(() => {
    if (!blocked) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [blocked]);

  if (!to || to.is_ghost || to.left_at || group.nudge_mode === "off" || group.archived_at) return null;
  const disabled = send.isPending || blocked;
  const label =
    availability.state === "cap" ? "Daily nudge limit reached" : availability.state === "cooldown" ? `Nudge again in ${countdown(availability.at, now)}` : null;

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
      title={label ?? undefined}
      className={cn(
        "flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-ink/15 px-3 text-[13px] font-semibold text-ink disabled:opacity-50",
        className,
      )}
    >
      <BellRing className="size-4" />
      <span className="tabular-nums">{send.isPending ? "Nudging…" : label ?? "Nudge"}</span>
    </button>
  );
}

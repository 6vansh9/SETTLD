"use client";

import { ChevronRight } from "lucide-react";
import { Amount, Avatar } from "@/components/ui";
import { describeActivity, type ActivityTarget } from "@/lib/activity";
import type { FeedRow } from "@/lib/activity-data";
import { localDate } from "@/lib/expense-form";
import { microDay } from "@/lib/groups";
import { PASTELS, pastelVar, type Pastel } from "@/lib/pastels";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Activity timeline grouped by day. With `showGroup`, each row carries its group's color stripe. */
export function ActivityList({
  rows,
  myUserId,
  showGroup = false,
  myDisplayName,
  onOpen,
}: {
  rows: FeedRow[];
  myUserId: string;
  /** Lets payment rows say "You" when I'm the receiver. */
  myDisplayName?: string | null;
  showGroup?: boolean;
  onOpen: (row: FeedRow, target: ActivityTarget) => void;
}) {
  const days: { day: string; rows: FeedRow[] }[] = [];
  for (const r of rows) {
    const day = localDate(new Date(r.created_at));
    const last = days[days.length - 1];
    if (last?.day === day) last.rows.push(r);
    else days.push({ day, rows: [r] });
  }

  return (
    <div className="space-y-6">
      {days.map(({ day, rows }) => (
        <section key={day} aria-label={microDay(day)}>
          <h3 className="micro mb-2 text-ink-faded">{microDay(day)}</h3>
          <ul className="overflow-hidden rounded-card border-[1.5px] border-ink/[0.08] bg-surface">
            {rows.map((r, i) => {
              const line = describeActivity(r, myUserId, myDisplayName);
              const color = r.actor?.profile?.avatar_color;
              const groupColor = r.group?.color;
              const body = (
                <>
                  {showGroup && groupColor && (
                    <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: pastelVar(groupColor) }} />
                  )}
                  <Avatar
                    name={r.actor?.display_name ?? "?"}
                    color={(PASTELS as readonly string[]).includes(color ?? "") ? (color as Pastel) : "lilac"}
                    photo={r.actor?.user_id ? r.actor?.profile?.avatar_url : null}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{line.text}</span>
                    <span className="micro mt-1 block truncate text-ink-faded">
                      {showGroup && r.group ? `${r.group.emoji} ${r.group.name} · ` : ""}
                      {time(r.created_at)}
                    </span>
                  </span>
                  {line.amount && <Amount amount={line.amount.value} currency={line.amount.currency} size="sm" className="shrink-0" />}
                  {line.target && <ChevronRight className="size-4 shrink-0 text-ink/30" aria-hidden />}
                </>
              );
              const cls = `relative flex min-h-14 w-full items-center gap-3 py-2.5 ${showGroup ? "pl-5" : "pl-4"} pr-3 text-left ${i > 0 ? "border-t-[1.5px] border-ink/[0.06]" : ""}`;
              return (
                <li key={r.id}>
                  {line.target ? (
                    <button type="button" onClick={() => onOpen(r, line.target)} className={`${cls} hover:bg-ink/[0.03]`}>
                      {body}
                    </button>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

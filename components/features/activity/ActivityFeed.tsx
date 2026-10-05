"use client";

import { EmptyState } from "@/components/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Title } from "@/components/ui";
import type { FeedRow } from "@/lib/activity-data";
import { useMyActivity } from "@/lib/queries/activity";
import { useMyActivityRealtime } from "@/lib/realtime/useMyActivityRealtime";
import { BottomTabBar } from "@/components/features/nav/BottomTabBar";
import { ActivityList } from "./ActivityList";

/** /activity: everything across my groups, grouped by day, with each group's color stripe. Live. */
export function ActivityFeed({
  initialRows,
  groupIds,
  myUserId,
  myDisplayName,
}: {
  initialRows: FeedRow[];
  groupIds: string[];
  myUserId: string;
  /** Profile name; member names follow it (sync trigger), so payment rows can say "You". */
  myDisplayName: string;
}) {
  const router = useRouter();
  const { data: rows = initialRows } = useMyActivity(initialRows);
  useMyActivityRealtime(groupIds, myUserId);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-app px-5 pb-[calc(112px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex h-11 items-center">
        <Link href="/groups" aria-label="Back to groups" className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-ink/5">
          <ArrowLeft className="size-5" strokeWidth={2.25} />
        </Link>
      </header>
      <div className="mt-4">
        <Title line1="ALL" line2="ACTIVITY" size="xl" />
      </div>
      <div className="mt-8">
        {rows.length === 0 ? (
          <EmptyState
            lines={["Quiet", "so far"]}
            hint="Expenses, payments and new members from all your groups show up here."
            cta={{ label: "Go to my groups", href: "/groups" }}
          />
        ) : (
          <ActivityList
            rows={rows}
            myUserId={myUserId}
            myDisplayName={myDisplayName}
            showGroup
            onOpen={(row, target) => {
              if (target?.type === "room") return router.push(`/room/${target.code}`);
              const open = !target ? "" : target.type === "members" ? "members" : `${target.type}:${target.id}`;
              router.push(`/g/${row.group_id}${open ? `?open=${encodeURIComponent(open)}` : "?tab=activity"}`);
            }}
          />
        )}
      </div>
      <BottomTabBar />
    </main>
  );
}

import Link from "next/link";
import { AnimatedAmount, AvatarStack, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { microDate } from "@/lib/groups";
import { activeMembers, memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import { pastelVar } from "@/lib/pastels";
import { CoverBackdrop } from "./CoverBackdrop";

/** Stacked Home card: avatars + date on top, big name, balance at the bottom. */
export function GroupCard({ group, href, myNet = 0 }: { group: GroupWithMembers; href?: string; myNet?: number }) {
  const members = activeMembers(group);
  const people = members.map(memberAvatar);

  const body = (
    <Card color={group.color} dogEar className={cn("transition-transform active:scale-[0.99]", group.cover_url && "isolate overflow-hidden")}>
      <div className={cn("relative flex justify-between", group.cover_url ? "-mx-5 -mt-5 items-end px-5 pb-5 pt-14 text-white" : "items-start")}>
        {/* A strip of the group's background photo (real colors, scrim behind the row, fade to pastel). */}
        <CoverBackdrop url={group.cover_url} color={group.color} variant="strip" />
        <div style={{ "--avatar-ring": pastelVar(group.color) } as React.CSSProperties}>
          <AvatarStack people={people} size="sm" max={4} />
        </div>
        <span className="micro mr-7 opacity-60">{microDate(group.created_at)}</span>
      </div>
      <h3 className="mt-5 flex items-center gap-2 font-display-alt text-[38px] uppercase leading-[0.9]">
        <span aria-hidden className="text-[30px]">
          {group.emoji}
        </span>
        <span className="min-w-0 break-words">{group.name}</span>
      </h3>
      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="micro opacity-60">
          {members.length} {members.length === 1 ? "member" : "members"}
        </span>
        <StatusChip net={myNet} currency={group.base_currency} />
      </div>
    </Card>
  );

  return href ? (
    <Link href={href} className="block rounded-card" aria-label={`Open ${group.name}`}>
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * Red "You owe ₹X" / green "You're owed ₹X" / grey "Settled up". On a pastel card red or green
 * *text* fails contrast, so the color is the chip's fill with dark text on it (AA in both themes;
 * lib/contrast.test.ts).
 */
function StatusChip({ net, currency }: { net: number; currency: GroupWithMembers["base_currency"] }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-on-pastel",
        net < 0 ? "bg-owe" : net > 0 ? "bg-owed" : "bg-on-pastel/10",
      )}
    >
      {net === 0 ? (
        "Settled up"
      ) : (
        <>
          {net < 0 ? "You owe" : "You're owed"}
          <AnimatedAmount amount={Math.abs(net)} currency={currency} size="sm" className="text-[20px]" />
        </>
      )}
    </span>
  );
}

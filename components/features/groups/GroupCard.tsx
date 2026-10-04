import Link from "next/link";
import { AnimatedAmount, AvatarStack, Card } from "@/components/ui";
import { microDate } from "@/lib/groups";
import { activeMembers, memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import { pastelVar } from "@/lib/pastels";

/** Stacked Home card: avatars + date on top, big name, balance at the bottom. */
export function GroupCard({ group, href, myNet = 0 }: { group: GroupWithMembers; href?: string; myNet?: number }) {
  const members = activeMembers(group);
  const people = members.map(memberAvatar);

  const body = (
    <Card color={group.color} dogEar className="transition-transform active:scale-[0.99]">
      <div className="flex items-start justify-between">
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
      <div className="mt-4 flex items-end justify-between">
        <span className="micro opacity-60">
          {members.length} {members.length === 1 ? "member" : "members"} ·{" "}
          {myNet > 0 ? "You're owed" : myNet < 0 ? "You owe" : "All settled"}
        </span>
        {/* Dark text on pastel: owe/owed reds and greens fail contrast here; the label says which. */}
        <AnimatedAmount amount={Math.abs(myNet)} currency={group.base_currency} size="lg" />
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

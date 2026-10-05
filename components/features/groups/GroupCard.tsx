import Link from "next/link";
import { AnimatedAmount, AvatarStack, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { microDate } from "@/lib/groups";
import { activeMembers, memberAvatar, type GroupWithMembers } from "@/lib/groups-data";
import { pastelVar } from "@/lib/pastels";
import { PHOTO_TEXT_SHADOW, SCRIM_RAMP_CARD } from "@/lib/images";
import { CoverBackdrop, CoverScrim } from "./CoverBackdrop";

/** Stacked Home card: avatars + date on top, big name, balance at the bottom. */
export function GroupCard({ group, href, myNet = 0 }: { group: GroupWithMembers; href?: string; myNet?: number }) {
  const members = activeMembers(group);
  const people = members.map(memberAvatar);

  const cover = !!group.cover_url;

  const body = cover ? (
    // Full-bleed photo inside a 3px ring of the group's pastel (the card background), dog-ear kept.
    // The photo stays clear at the top; a scrim sits only behind the name, members and chip.
    <Card color={group.color} dogEar className="isolate flex min-h-[240px] flex-col overflow-hidden text-white transition-transform active:scale-[0.99]">
      <div aria-hidden className="pointer-events-none absolute inset-[3px] -z-10 overflow-hidden rounded-[20px]">
        <CoverBackdrop url={group.cover_url} />
      </div>
      <div className="flex items-start justify-between" style={{ textShadow: PHOTO_TEXT_SHADOW }}>
        <div className="drop-shadow-[0_1px_3px_rgb(0_0_0/0.45)]" style={{ "--avatar-ring": pastelVar(group.color) } as React.CSSProperties}>
          <AvatarStack people={people} size="sm" max={4} />
        </div>
        <span className="micro mr-7">{microDate(group.created_at)}</span>
      </div>
      <div className="relative mt-auto">
        <CoverScrim rampPx={SCRIM_RAMP_CARD} className="-inset-x-5 -bottom-10" />
        <h3 className="flex items-center gap-2 font-display-alt text-[38px] uppercase leading-[0.9]">
          <span aria-hidden className="text-[30px]">
            {group.emoji}
          </span>
          <span className="min-w-0 break-words">{group.name}</span>
        </h3>
        <div className="mt-3 flex items-end justify-between gap-3">
          <span className="micro">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
          <StatusChip net={myNet} currency={group.base_currency} onPhoto />
        </div>
      </div>
    </Card>
  ) : (
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
function StatusChip({ net, currency, onPhoto = false }: { net: number; currency: GroupWithMembers["base_currency"]; onPhoto?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-on-pastel",
        // On a photo every chip is solid (a translucent "Settled up" would turn dark-on-dark).
        net < 0 ? "bg-owe" : net > 0 ? "bg-owed" : onPhoto ? "bg-white" : "bg-on-pastel/10",
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

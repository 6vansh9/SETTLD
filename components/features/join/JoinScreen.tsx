"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, Button, Title } from "@/components/ui";
import { friendlyError } from "@/lib/groups";
import { spring } from "@/lib/motion";
import { pastelVar, type Pastel } from "@/lib/pastels";
import { useClaimGhost, useJoinGroup } from "@/lib/queries/groups";
import type { InviteDetails } from "@/lib/supabase/types";

export interface InvitePreview {
  name: string;
  emoji: string;
  color: Pastel;
  member_count: number;
}

export function JoinScreen({
  token,
  preview,
  details,
}: {
  token: string;
  preview: InvitePreview;
  /** null when signed out. */
  details: InviteDetails | null;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const join = useJoinGroup();
  const claim = useClaimGhost();
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const busy = join.isPending || claim.isPending;
  const nextParam = `?next=${encodeURIComponent(`/join/${token}`)}`;

  const doJoin = async () => {
    setError(null);
    try {
      router.push(`/g/${await join.mutateAsync(token)}`);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const doClaim = async (memberId: string) => {
    setError(null);
    setClaimingId(memberId);
    try {
      router.push(`/g/${await claim.mutateAsync({ token, memberId })}`);
    } catch (err) {
      setError(friendlyError(err));
      setClaimingId(null);
    }
  };

  const ghosts = details?.claim ? [] : (details?.ghosts ?? []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))]">
      <span className="micro">Settld · Invite</span>

      <div className="mt-8">
        <Title line1="YOU'RE" line2="INVITED" size="xl" />
      </div>

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, rotate: -4 }}
        animate={{ opacity: 1, y: 0, rotate: -2 }}
        transition={reduce ? { duration: 0.2 } : { ...spring, delay: 0.1 }}
        className="mt-8 rounded-card border-[1.5px] border-on-pastel/[0.08] p-6 text-on-pastel"
        style={{ backgroundColor: pastelVar(preview.color) }}
      >
        <div className="text-[48px] leading-none" aria-hidden>
          {preview.emoji}
        </div>
        <p className="mt-4 break-words font-display text-[48px] uppercase leading-[0.9]">{preview.name}</p>
        <p className="micro mt-4 opacity-60">
          <span className="font-num text-[18px] tracking-normal">{preview.member_count}</span>{" "}
          {preview.member_count === 1 ? "member" : "members"} · splitting live
        </p>
      </motion.div>

      <div className="flex-1" />

      {error && (
        <p role="alert" className="mt-6 text-center text-[14px] font-medium text-owe">
          {error}
        </p>
      )}

      {!details ? (
        <div className="mt-8 space-y-3">
          <Link
            href={`/signup${nextParam}`}
            className="flex h-14 w-full items-center justify-center rounded-full bg-coral font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
          >
            Join with a free account
          </Link>
          <Link
            href={`/login${nextParam}`}
            className="flex h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold text-ink hover:bg-ink/5"
          >
            I already have an account
          </Link>
          <p className="text-center text-[13px] font-medium text-ink/50">It takes 30 seconds. We&apos;ll bring you straight back here.</p>
        </div>
      ) : details.claim ? (
        <div className="mt-8 space-y-3">
          <p className="text-center text-[15px] font-medium text-ink/70">
            This spot was saved for <span className="font-semibold text-ink">{details.claim.display_name}</span>.
            Anything already split with them becomes yours.
          </p>
          <Button fullWidth onClick={doJoin} disabled={busy}>
            {join.isPending ? "Joining…" : `I'm ${details.claim.display_name.split(" ")[0]}, join`}
          </Button>
        </div>
      ) : (
        <div className="mt-8">
          <Button fullWidth onClick={doJoin} disabled={busy}>
            {join.isPending ? "Joining…" : "Join group"}
          </Button>

          {ghosts.length > 0 && (
            <section className="mt-8" aria-labelledby="ghosts-heading">
              <h2 id="ghosts-heading" className="micro text-ink-faded">
                Already added by name? Tap yours
              </h2>
              <ul className="mt-3 divide-y-[1.5px] divide-ink/[0.06] rounded-card border-[1.5px] border-ink/[0.08] bg-surface">
                {ghosts.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={g.display_name} ghost size="md" />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{g.display_name}</span>
                    <Button
                      variant="secondary"
                      className="h-10 px-4 text-[13px]"
                      onClick={() => doClaim(g.id)}
                      disabled={busy}
                    >
                      {claimingId === g.id ? "Claiming…" : "That's me"}
                    </Button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13px] font-medium text-ink/50">
                Their past expenses and balance move to your account.
              </p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

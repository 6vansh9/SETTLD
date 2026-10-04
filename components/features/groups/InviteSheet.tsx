"use client";

import { Check, Copy, RefreshCw, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { friendlyError, inviteShareText, inviteUrl, whatsappUrl } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups-data";
import { pastelVar } from "@/lib/pastels";
import { useInviteToken, useRegenerateInvite } from "@/lib/queries/groups";
import { copyText, shareOrCopy } from "@/lib/share";
import { QrCode } from "./QrCode";

export function InviteSheet({
  open,
  onClose,
  group,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  group: GroupWithMembers;
  isAdmin: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Invite to ${group.name}`}>
      <InviteBody group={group} isAdmin={isAdmin} />
    </Sheet>
  );
}

function InviteBody({ group, isAdmin }: { group: GroupWithMembers; isAdmin: boolean }) {
  const { data: token, isLoading, error } = useInviteToken(group.id);
  const regenerate = useRegenerateInvite(group.id);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const url = token && origin ? inviteUrl(origin, token) : "";
  const text = url ? inviteShareText(group, url) : "";

  const share = async () => {
    const result = await shareOrCopy({ title: `Join ${group.name} on Settld`, text, url });
    if (result === "copied") setCopied(true);
    if (result === "failed") setMessage("Couldn't share. Copy the link instead.");
  };

  const copy = async () => {
    if (await copyText(url)) setCopied(true);
  };

  const reset = async () => {
    setMessage(null);
    try {
      await regenerate.mutateAsync();
      setConfirmReset(false);
      setMessage("New link ready. The old one no longer works.");
    } catch (err) {
      setMessage(friendlyError(err));
    }
  };

  if (group.archived_at) {
    return <p className="text-[15px] font-medium text-ink/60">This group is archived. Unarchive it to invite people.</p>;
  }

  return (
    <div>
      <div
        className="flex flex-col items-center rounded-card border-[1.5px] border-on-pastel/[0.08] p-6 text-on-pastel"
        style={{ backgroundColor: pastelVar(group.color) }}
      >
        <p className="flex items-center gap-2 font-display-alt text-[32px] uppercase leading-[0.9]">
          <span aria-hidden>{group.emoji}</span>
          {group.name}
        </p>
        <p className="micro mt-2 opacity-60">Scan to join</p>
        <div className="mt-5 w-[200px]">
          {url ? (
            <QrCode value={url} label={`QR code for ${url}`} />
          ) : (
            <div className="aspect-square animate-pulse rounded-[20px] bg-white/60" />
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-[14px] font-medium text-owe">
          {friendlyError(error)}
        </p>
      ) : !isLoading && !token ? (
        <p className="mt-4 text-[14px] font-medium text-ink/60">No active link. {isAdmin ? "Create a new one below." : "Ask an admin for a new one."}</p>
      ) : null}

      <button
        type="button"
        onClick={copy}
        disabled={!url}
        className="mt-4 flex h-14 w-full items-center gap-3 rounded-2xl border-[1.5px] border-ink/15 bg-bg px-4 text-left"
        aria-label="Copy invite link"
      >
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink/70">{url || "Loading link…"}</span>
        {copied ? <Check className="size-5 text-owed" strokeWidth={2.5} /> : <Copy className="size-5 text-ink/50" />}
      </button>
      <p aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={share} disabled={!url}>
          <Share2 className="size-5" strokeWidth={2.25} />
          {copied ? "Copied" : "Share"}
        </Button>
        <a
          href={url ? whatsappUrl(text) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!url}
          className="inline-flex h-14 items-center justify-center rounded-full bg-[#25D366] px-6 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          WhatsApp
        </a>
      </div>

      {message && (
        <p role="status" className="mt-4 text-center text-[14px] font-medium text-ink/70">
          {message}
        </p>
      )}

      {isAdmin && (
        <div className="mt-6 border-t-[1.5px] border-ink/[0.06] pt-4">
          {confirmReset || !token ? (
            <div className="space-y-2">
              {token && (
                <p className="text-[14px] font-medium text-ink/70">
                  Anyone with the old link won&apos;t be able to join. People already in stay in.
                </p>
              )}
              <div className="flex gap-2">
                {token && (
                  <Button variant="ghost" className="flex-1" onClick={() => setConfirmReset(false)}>
                    Cancel
                  </Button>
                )}
                <Button variant="secondary" className="flex-1" onClick={reset} disabled={regenerate.isPending}>
                  {regenerate.isPending ? "Resetting…" : token ? "Reset link" : "Create link"}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" fullWidth onClick={() => setConfirmReset(true)}>
              <RefreshCw className="size-4" strokeWidth={2.5} />
              Reset invite link
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

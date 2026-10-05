"use client";

import { Copy, MessageCircle, MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";
import { PhoneField, phoneError, type PhoneValue } from "@/components/features/profile/PhoneField";
import { Button } from "@/components/ui";
import { friendlyError, inviteUrl } from "@/lib/groups";
import type { GroupWithMembers } from "@/lib/groups-data";
import { formatPhone, fromE164, ghostInviteText, smsInviteUrl, toE164, whatsappInviteUrl } from "@/lib/phone";
import { isIOS } from "@/lib/push-client";
import { useSetGhostPhone } from "@/lib/queries/phone";
import { useGhostClaimLink } from "@/lib/queries/groups";
import { copyText } from "@/lib/share";

/**
 * "Send invite" for a ghost: their personal claim link in a friendly message, by WhatsApp or SMS
 * (to their number when we have one). The link is what lets them take the spot, not the number.
 */
export function SendInvitePanel({
  group,
  memberId,
  name,
  phone,
  onAddedPhone,
}: {
  group: GroupWithMembers;
  memberId: string;
  name: string;
  phone: string | null;
  onAddedPhone?: (e164: string) => void;
}) {
  const claimLink = useGhostClaimLink();
  const setPhone = useSetGhostPhone(group.id);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState<PhoneValue>(() => fromE164(null));
  const [touched, setTouched] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIOS());
    let alive = true;
    claimLink
      .mutateAsync(memberId)
      .then((token) => alive && setUrl(inviteUrl(window.location.origin, token)))
      .catch((e) => alive && setError(friendlyError(e)));
    return () => {
      alive = false;
    };
    // once per ghost
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const text = url ? ghostInviteText(name, group.name, url) : "";
  const linkCls =
    "flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold aria-disabled:pointer-events-none aria-disabled:opacity-40";

  return (
    <div className="rounded-2xl border-[1.5px] border-ink/[0.08] bg-ink/[0.02] p-4">
      <p className="text-[15px] font-semibold">Send {name.split(" ")[0]} an invite</p>
      <p className="mt-0.5 text-[13px] font-medium text-ink/55">
        {phone ? `To ${formatPhone(phone)}. ` : ""}Their personal link lets them take this spot, with everything already split.
      </p>
      <div className="mt-3 flex gap-2">
        <a
          href={url ? whatsappInviteUrl(phone, text) : undefined}
          aria-disabled={!url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkCls} bg-[#25D366] text-[#0E0E0E]`}
        >
          <MessageCircle className="size-5" />
          WhatsApp
        </a>
        <a href={url ? smsInviteUrl(phone, text, ios) : undefined} aria-disabled={!url} className={`${linkCls} border-[1.5px] border-ink/15 bg-surface text-ink`}>
          <MessageSquareText className="size-5" />
          SMS
        </a>
      </div>
      <button
        type="button"
        disabled={!url}
        onClick={async () => {
          if (url && (await copyText(text))) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-ink/60 disabled:opacity-40"
      >
        <Copy className="size-4" />
        {copied ? "Copied" : "Copy message"}
      </button>

      {!phone && (
        <form
          noValidate
          className="mt-3 border-t-[1.5px] border-ink/[0.06] pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setTouched(true);
            const e164 = toE164(adding.national, adding.country);
            if (!e164) return;
            try {
              await setPhone.mutateAsync({ memberId, phone: e164 });
              onAddedPhone?.(e164);
            } catch (err) {
              setError(friendlyError(err));
            }
          }}
        >
          <PhoneField label="Their number (optional)" value={adding} onChange={setAdding} error={touched ? phoneError(adding, true) : null} />
          <Button type="submit" variant="secondary" fullWidth className="mt-2 h-11" disabled={setPhone.isPending}>
            {setPhone.isPending ? "Saving…" : "Save number"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-owe-ink">
          {error}
        </p>
      )}
    </div>
  );
}

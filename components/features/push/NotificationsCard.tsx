"use client";

import { BellOff, BellRing, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { friendlyError } from "@/lib/groups";
import { disablePush, enablePush, pushState, pushSupport, type PushState, type PushSupport } from "@/lib/push-client";

/** /me › Notifications: turn push on/off for this device, or explain Add to Home Screen on iPhone. */
export function NotificationsCard() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s === "supported") void pushState().then(setState);
  }, []);

  if (support === null) return <div className="h-20 animate-pulse rounded-2xl bg-ink/5" />;

  if (support === "ios-needs-home-screen") {
    return (
      <div className="px-4 py-4">
        <p className="text-[15px] font-semibold">Get notified on iPhone</p>
        <p className="mt-1 text-[13px] font-medium text-ink/60">iPhone only sends notifications to apps on your Home Screen. A few taps:</p>
        <ol className="mt-3 space-y-2 text-[14px] font-medium">
          <li className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink/5">1</span>
            Tap <Share className="inline size-4" aria-label="Share" /> in Safari&apos;s toolbar
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink/5">2</span>
            Choose <SquarePlus className="inline size-4" aria-hidden /> Add to Home Screen
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink/5">3</span>
            Open Settld from your Home Screen, come back here and turn them on
          </li>
        </ol>
      </div>
    );
  }

  if (support === "unsupported") {
    return <p className="px-4 py-4 text-[14px] font-medium text-ink/60">This browser can&apos;t receive notifications.</p>;
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[15px] font-semibold">Notifications on this device</span>
          <span className="mt-0.5 block text-[13px] font-medium text-ink/50">
            {state === "on"
              ? "On. Choose what each group sends in its settings."
              : state === "denied"
                ? "Blocked. On iPhone: Settings › Notifications › Settld. Elsewhere: the site settings."
                : "New expenses, payments, comments and nudges."}
          </span>
        </span>
      </div>
      {state === "on" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
              setMsg(res?.ok ? "Sent. It should arrive in a few seconds." : "Couldn't send a test. Try again.");
              setBusy(false);
            }}
          >
            Send a test
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await disablePush();
                setState("off");
              } finally {
                setBusy(false);
              }
            }}
          >
            <BellOff className="size-4" />
            Turn off
          </Button>
        </div>
      ) : (
        state !== "denied" && (
          <Button
            fullWidth
            className="mt-3"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                const s = await enablePush();
                setState(s);
                if (s === "denied") setMsg("You said no. You can change that in Settings any time.");
              } catch (e) {
                setMsg(friendlyError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <BellRing className="size-5" />
            Turn on notifications
          </Button>
        )
      )}
      {msg && (
        <p role="status" className="mt-2 text-[13px] font-medium text-ink/60">
          {msg}
        </p>
      )}
    </div>
  );
}

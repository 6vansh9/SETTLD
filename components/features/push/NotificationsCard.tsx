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

  /** Through the server and the push service, like a real notification. */
  const sendTest = async () => {
    setBusy(true);
    setMsg(null);
    try {
      // Re-save this device first, in case the server dropped it.
      const now = state === "on" ? await enablePush() : await pushState();
      setState(now);
      if (now !== "on") {
        setMsg("Turn notifications on first, then send a test.");
        return;
      }
      const res = await fetch("/api/push/test", { method: "POST" }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { sent?: number; devices?: number; failures?: string[] } | null;
      if (res?.ok) setMsg(`Sent to ${body?.sent} device${body?.sent === 1 ? "" : "s"}. It should arrive in a few seconds, even with Settld open.`);
      else if (res?.status === 404) setMsg("No device is registered for you yet. Turn notifications off and on again.");
      else if (!res) setMsg("Couldn't reach Settld. Check your connection.");
      else setMsg(`The push service refused it (${body?.failures?.[0] ?? res.status}). Turn notifications off and on again.`);
    } catch (e) {
      setMsg(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (support === null) return <div className="h-20 animate-pulse rounded-2xl bg-ink/5" />;

  if (support === "ios-needs-home-screen") {
    return (
      <div className="px-4 py-4">
        <p className="text-[15px] font-semibold">Get notified on iPhone</p>
        <p className="mt-1 text-[13px] font-medium text-ink/60">iPhone only sends notifications to apps on your Home Screen. A few taps:</p>
        <ol className="mt-3 space-y-2 text-[14px] font-medium">
          <li className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink/5">1</span>
            Tap <Share className="inline size-4" aria-label="Share" /> in Safari (or ••• then Share)
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-ink/5">2</span>
            Choose <SquarePlus className="inline size-4" aria-hidden /> Add to Home Screen (under View More if hidden)
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
          <span className="mt-0.5 block text-[13px] font-medium text-ink/60">
            {state === "on"
              ? "On. Choose what each group sends in its settings."
              : state === "denied"
                ? "Blocked. On iPhone: Settings › Notifications › Settld. Elsewhere: the site settings."
                : "New expenses, payments, comments and nudges."}
          </span>
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {state !== "on" && state !== "denied" && (
          <Button
            fullWidth
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
        )}
        <div className={state === "on" ? "grid grid-cols-2 gap-2" : undefined}>
          <Button variant="secondary" fullWidth disabled={busy || state === "denied"} onClick={sendTest}>
            Send test notification
          </Button>
          {state === "on" && (
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
          )}
        </div>
      </div>
      {msg && (
        <p role="status" className="mt-2 text-[13px] font-medium text-ink/60">
          {msg}
        </p>
      )}
    </div>
  );
}

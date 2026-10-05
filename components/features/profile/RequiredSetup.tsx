"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Title } from "@/components/ui";
import { isStandalone } from "@/components/features/onboarding/HomeScreenGuide";
import { NotificationPermission } from "@/components/features/push/NotificationPermission";
import { friendlyError } from "@/lib/groups";
import { missingRequired } from "@/lib/onboarding";
import { fromE164, toE164 } from "@/lib/phone";
import { PUSH_STEP_DONE_KEY, pushSupport } from "@/lib/push-client";
import { useMyPhone, useSetMyPhone } from "@/lib/queries/phone";
import { useProfile, useUpdateProfile } from "@/lib/queries/profile";
import { isValidUpiId, normalizeUpiId } from "@/lib/upi";
import { PhoneField, phoneError, type PhoneValue } from "./PhoneField";
import { TextField } from "./TextField";

/** App screens only (not the landing page, sign-in, onboarding or invite pages). */
const APP_ROUTE = /^\/(groups|g\/|activity|me|room\/)/;

/**
 * Full-screen steps shown before the app, in order:
 *  1. "Add your number"  (phone is required; people who signed up before it was see this once)
 *  2. "Add your UPI ID"  (or "I don't use UPI (living outside India)")
 *  3. "Turn on notifications": the first time the Home Screen app opens without permission
 *     (iPhone can only ask there). Answered once per device, never loops.
 * Unknown (loading, offline) never blocks.
 */
export function RequiredSetup() {
  const pathname = usePathname() ?? "";
  const onApp = APP_ROUTE.test(pathname);
  const { data: profile } = useProfile();
  const onboarded = !!profile?.onboarded_at;
  const phoneQuery = useMyPhone();
  const phone = onApp && onboarded && phoneQuery.isSuccess ? phoneQuery.data : undefined;
  const [askPush, setAskPush] = useState(false);

  useEffect(() => {
    if (!onApp || !onboarded) return;
    let done = false;
    try {
      done = localStorage.getItem(PUSH_STEP_DONE_KEY) === "1";
    } catch {
      done = true; // can't remember an answer → don't risk asking every open
    }
    setAskPush(!done && isStandalone() && pushSupport() === "supported" && Notification.permission === "default");
  }, [onApp, onboarded]);

  if (!onApp || !profile || !onboarded) return null;
  const missing = missingRequired({ phone, upiId: profile.upi_id, upiOptOut: profile.upi_opt_out });
  if (!missing && !askPush) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="required-setup-title"
      className="fixed inset-0 z-[90] overflow-y-auto overscroll-contain bg-bg"
    >
      <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-[calc(28px+env(safe-area-inset-top))]">
        <span className="micro text-ink-faded">One more thing</span>
        {missing === "phone" ? (
          <PhoneStep />
        ) : missing === "upi" ? (
          <UpiStep />
        ) : (
          <>
            <div id="required-setup-title" className="mt-4">
        <Title line1="STAY IN" line2="THE LOOP" size="lg" />
      </div>
            <NotificationPermission onDone={() => setAskPush(false)} />
          </>
        )}
      </main>
    </div>
  );
}

function PhoneStep() {
  const save = useSetMyPhone();
  const [value, setValue] = useState<PhoneValue>(() => fromE164(null));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      noValidate
      className="flex flex-1 flex-col"
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        const e164 = toE164(value.national, value.country);
        if (!e164) return;
        setError(null);
        try {
          await save.mutateAsync(e164);
        } catch (err) {
          setError(friendlyError(err));
        }
      }}
    >
      <div id="required-setup-title" className="mt-4">
        <Title line1="ADD YOUR" line2="NUMBER" size="lg" />
      </div>
      <p className="mt-4 text-[15px] font-medium text-ink/70">
        Settld now needs your phone number, so friends who add you by number can invite you straight in. It stays private:
        nobody in your groups sees it.
      </p>
      <div className="mt-8 flex-1">
        <PhoneField label="Phone number" autoFocus value={value} onChange={setValue} error={(touched ? phoneError(value, true) : null) ?? error} />
      </div>
      <Button type="submit" fullWidth className="mt-6" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save and continue"}
      </Button>
    </form>
  );
}

function UpiStep() {
  const update = useUpdateProfile();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const saveUpi = async (patch: { upi_id: string | null; upi_opt_out?: boolean }) => {
    setError(null);
    try {
      await update.mutateAsync(patch);
    } catch (err) {
      setError(friendlyError(err));
    }
  };
  return (
    <form
      noValidate
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return setError("Add your UPI ID so friends can pay you back.");
        if (!isValidUpiId(value)) return setError("UPI IDs look like name@bank, e.g. vansh@okhdfcbank.");
        void saveUpi({ upi_id: normalizeUpiId(value) });
      }}
    >
      <div id="required-setup-title" className="mt-4">
        <Title line1="ADD YOUR" line2="UPI ID" size="lg" />
      </div>
      <p className="mt-4 text-[15px] font-medium text-ink/70">So friends can pay you back in one tap via GPay, PhonePe or Paytm.</p>
      <div className="mt-8 flex-1">
        <TextField
          label="UPI ID"
          autoFocus
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="name@okhdfcbank"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          error={error}
        />
      </div>
      <Button type="submit" fullWidth className="mt-6" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save and continue"}
      </Button>
      <Button type="button" variant="ghost" fullWidth className="mt-2" disabled={update.isPending} onClick={() => void saveUpi({ upi_id: null, upi_opt_out: true })}>
        I don&apos;t use UPI (living outside India)
      </Button>
    </form>
  );
}

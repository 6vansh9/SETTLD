"use client";

import { useEffect, useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { friendlyError } from "@/lib/groups";
import { fromE164, toE164 } from "@/lib/phone";
import { useSetMyPhone } from "@/lib/queries/phone";
import { PhoneField, phoneError, type PhoneValue } from "./PhoneField";

/** Edit my phone (/me) or add it the first time (one-time prompt for existing users). */
export function PhoneSheet({
  open,
  onClose,
  current,
  title = "Phone number",
  intro,
  laterLabel,
  onLater,
}: {
  open: boolean;
  onClose: () => void;
  current: string | null;
  title?: string;
  intro?: string;
  /** Shown as a second button (the one-time prompt's "Later"). */
  laterLabel?: string;
  onLater?: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <PhoneForm current={current} intro={intro} onDone={onClose} laterLabel={laterLabel} onLater={onLater} />
    </Sheet>
  );
}

function PhoneForm({ current, intro, onDone, laterLabel, onLater }: { current: string | null; intro?: string; onDone: () => void; laterLabel?: string; onLater?: () => void }) {
  const save = useSetMyPhone();
  const [value, setValue] = useState<PhoneValue>(() => fromE164(current));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setValue(fromE164(current)), [current]);
  const invalid = phoneError(value, true);

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setTouched(true);
        const e164 = toE164(value.national, value.country);
        if (!e164) return;
        setError(null);
        try {
          await save.mutateAsync(e164);
          onDone();
        } catch (err) {
          setError(friendlyError(err));
        }
      }}
    >
      {intro && <p className="mb-4 text-[15px] font-medium text-ink/70">{intro}</p>}
      <PhoneField
        label="Phone number"
        autoFocus
        value={value}
        onChange={setValue}
        error={(touched ? invalid : null) ?? error}
        hint="Private: nobody in your groups ever sees it."
      />
      <Button type="submit" fullWidth className="mt-6" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save"}
      </Button>
      {laterLabel && onLater && (
        <Button type="button" variant="ghost" fullWidth className="mt-2" onClick={onLater}>
          {laterLabel}
        </Button>
      )}
    </form>
  );
}

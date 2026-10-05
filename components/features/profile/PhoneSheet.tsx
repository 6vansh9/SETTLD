"use client";

import { useEffect, useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { friendlyError } from "@/lib/groups";
import { fromE164, toE164 } from "@/lib/phone";
import { useSetMyPhone } from "@/lib/queries/phone";
import { PhoneField, phoneError, type PhoneValue } from "./PhoneField";

/** Edit my phone on /me (it can be changed, not removed). */
export function PhoneSheet({
  open,
  onClose,
  current,
  title = "Phone number",
  intro,
}: {
  open: boolean;
  onClose: () => void;
  current: string | null;
  title?: string;
  intro?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <PhoneForm current={current} intro={intro} onDone={onClose} />
    </Sheet>
  );
}

function PhoneForm({ current, intro, onDone }: { current: string | null; intro?: string; onDone: () => void }) {
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
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import { friendlyError, GROUP_TYPES, validateName } from "@/lib/groups";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/money";
import type { Pastel } from "@/lib/pastels";
import { useCreateGroup } from "@/lib/queries/groups";
import type { GroupType } from "@/lib/supabase/types";
import { EmojiPicker, GroupNameField, GroupPreview, PastelPicker } from "./GroupFields";

export function CreateGroupSheet({
  open,
  onClose,
  defaultCurrency,
}: {
  open: boolean;
  onClose: () => void;
  defaultCurrency: CurrencyCode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="New group">
      <CreateGroupForm defaultCurrency={defaultCurrency} />
    </Sheet>
  );
}

function CreateGroupForm({ defaultCurrency }: { defaultCurrency: CurrencyCode }) {
  const router = useRouter();
  const create = useCreateGroup();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏝️");
  const [color, setColor] = useState<Pastel>("pink");
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency);
  const [type, setType] = useState<GroupType>("trip");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = touched ? validateName(name) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (validateName(name)) return;
    setError(null);
    try {
      const id = await create.mutateAsync({ name, emoji, color, baseCurrency: currency, type });
      router.push(`/g/${id}`);
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <GroupPreview name={name} emoji={emoji} color={color} />
      <GroupNameField value={name} onChange={setName} error={nameError} />
      <EmojiPicker value={emoji} onChange={setEmoji} />
      <PastelPicker value={color} onChange={setColor} />

      <div>
        <p className="micro mb-2 text-ink-faded">Type</p>
        <div role="radiogroup" aria-label="Type" className="grid grid-cols-4 gap-2">
          {GROUP_TYPES.map((t) => (
            <Chip key={t.value} active={type === t.value} onClick={() => setType(t.value)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="micro mb-2 text-ink-faded">Base currency</p>
        <div role="radiogroup" aria-label="Base currency" className="grid grid-cols-5 gap-2">
          {CURRENCY_CODES.map((c) => (
            <Chip key={c} active={currency === c} onClick={() => setCurrency(c)} label={CURRENCIES[c].name}>
              {c}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-[13px] font-medium text-ink/60">Balances are kept in this currency.</p>
      </div>

      {error && (
        <p role="alert" className="text-center text-[14px] font-medium text-owe-ink">
          {error}
        </p>
      )}

      <Button type="submit" fullWidth disabled={create.isPending}>
        {create.isPending ? "Creating…" : "Create group"}
      </Button>
    </form>
  );
}

function Chip({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-11 items-center justify-center rounded-full border-[1.5px] text-[13px] font-semibold transition-colors",
        active ? "border-ink bg-ink text-bg" : "border-ink/15 text-ink",
      )}
    >
      {children}
    </button>
  );
}

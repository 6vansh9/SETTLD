"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar, Button, Sheet, Switch, ThemeToggle, Title } from "@/components/ui";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import type { Pastel } from "@/lib/pastels";
import { useProfile, useUpdateProfile } from "@/lib/queries/profile";
import { signOutAndReset } from "@/lib/session-reset";
import type { Profile } from "@/lib/supabase/types";
import { isValidUpiId, normalizeUpiId } from "@/lib/upi";
import { BottomTabBar } from "@/components/features/nav/BottomTabBar";
import { NotificationsCard } from "@/components/features/push/NotificationsCard";
import { ProfilePhotoControls } from "@/components/features/photos/ProfilePhoto";
import { formatPhone } from "@/lib/phone";
import { useMyPhone } from "@/lib/queries/phone";
import { ColorPicker } from "./ColorPicker";
import { PhoneSheet } from "./PhoneSheet";
import { CurrencyPicker } from "./CurrencyPicker";
import { TextField } from "./TextField";

type Editing = "name" | "color" | "upi" | "currency" | "phone" | null;

export function ProfileScreen({ initialProfile, email }: { initialProfile: Profile; email: string }) {
  const queryClient = useQueryClient();
  const { data } = useProfile(initialProfile);
  const profile = data ?? initialProfile;
  const update = useUpdateProfile();
  const { data: phone = null } = useMyPhone();
  const [editing, setEditing] = useState<Editing>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async (patch: Parameters<typeof update.mutateAsync>[0]) => {
    setSaveError(null);
    try {
      await update.mutateAsync(patch);
      setEditing(null);
    } catch {
      setSaveError("Couldn't save. Check your connection and try again.");
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    await signOutAndReset(queryClient);
  };

  return (
    <main className="mx-auto w-full max-w-app px-5 pb-[calc(112px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex h-11 items-center">
        <Link
          href="/groups"
          aria-label="Back to groups"
          className="-ml-2 flex size-11 items-center justify-center rounded-full hover:bg-ink/5"
        >
          <ArrowLeft className="size-5" strokeWidth={2.25} />
        </Link>
      </header>

      <div className="mt-4 flex items-end justify-between gap-4">
        <Title line1="YOUR" line2="PROFILE" size="lg" />
        <button
          type="button"
          onClick={() => setEditing("color")}
          aria-label="Change photo or avatar color"
          className="rounded-full"
        >
          <Avatar name={profile.name} color={profile.avatar_color} photo={profile.avatar_url} size="lg" className="size-20 text-[26px]" />
        </button>
      </div>

      {saveError && !editing && (
        <p role="alert" className="mt-4 text-[14px] font-medium text-owe-ink">
          {saveError}
        </p>
      )}

      <Group label="You">
        <Row label="Name" value={profile.name} onClick={() => setEditing("name")} />
        <Row label="Email" value={email} />
        <Row label="Phone" value={phone ? formatPhone(phone) : "Add your number"} faded={!phone} onClick={() => setEditing("phone")} />
        <Row
          label="UPI ID"
          value={profile.upi_id ?? (profile.upi_opt_out ? "Not using UPI" : "Add for 1-tap payback")}
          faded={!profile.upi_id}
          onClick={() => setEditing("upi")}
        />
      </Group>

      <Group label="Money">
        <Row
          label="Default currency"
          value={`${CURRENCIES[profile.default_currency].symbol} ${profile.default_currency}`}
          onClick={() => setEditing("currency")}
        />
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span>
            <span className="block text-[15px] font-semibold">Blur amounts on open</span>
            <span className="mt-0.5 block text-[13px] font-medium text-ink/60">Tap any amount to peek.</span>
          </span>
          <Switch
            label="Blur amounts on open"
            checked={profile.privacy_blur}
            onChange={(privacy_blur) => save({ privacy_blur })}
          />
        </div>
      </Group>

      <div id="notifications" className="scroll-mt-6">
        <Group label="Notifications">
          <NotificationsCard />
        </Group>
      </div>

      <Group label="Look">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-[15px] font-semibold">Theme</span>
          <ThemeToggle />
        </div>
      </Group>

      <Button variant="secondary" fullWidth className="mt-10 h-14" onClick={signOut} disabled={signingOut}>
        <LogOut className="size-5" strokeWidth={2.25} />
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>

      <BottomTabBar />
      <NameSheet
        open={editing === "name"}
        initial={profile.name}
        saving={update.isPending}
        error={saveError}
        onClose={() => setEditing(null)}
        onSave={(name) => save({ name })}
      />
      <ColorSheet
        open={editing === "color"}
        profile={profile}
        name={profile.name}
        initial={profile.avatar_color}
        saving={update.isPending}
        onClose={() => setEditing(null)}
        onSave={(avatar_color) => save({ avatar_color })}
      />
      <PhoneSheet open={editing === "phone"} onClose={() => setEditing(null)} current={phone} />
      <UpiSheet
        open={editing === "upi"}
        initial={profile.upi_id ?? ""}
        saving={update.isPending}
        error={saveError}
        onClose={() => setEditing(null)}
        optedOut={profile.upi_opt_out}
        onSave={(upi_id) => save(upi_id ? { upi_id } : { upi_id: null, upi_opt_out: true })}
      />
      <CurrencySheet
        open={editing === "currency"}
        initial={profile.default_currency}
        saving={update.isPending}
        onClose={() => setEditing(null)}
        onSave={(default_currency) => save({ default_currency })}
      />
    </main>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="micro mb-3 text-ink-faded">{label}</h2>
      <div className="divide-y-[1.5px] divide-ink/[0.06] overflow-hidden rounded-card border-[1.5px] border-ink/[0.08] bg-surface">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  faded,
  onClick,
}: {
  label: string;
  value: string;
  faded?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="shrink-0 text-[15px] font-semibold">{label}</span>
      <span className={`ml-auto truncate text-[15px] font-medium ${faded ? "text-ink/60" : "text-ink/70"}`}>
        {value}
      </span>
      {onClick && <ChevronRight className="size-4 shrink-0 text-ink/30" strokeWidth={2.5} />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-ink/[0.03]">
      {content}
    </button>
  ) : (
    <div className="flex min-h-14 items-center gap-3 px-4">{content}</div>
  );
}

interface EditSheetProps<T> {
  open: boolean;
  initial: T;
  saving: boolean;
  onClose: () => void;
  onSave: (value: T) => void;
}

// Each sheet's draft state lives in its body, which mounts when the sheet opens,
// so a cancelled edit never leaks into the next one.

function NameSheet({ open, onClose, ...rest }: EditSheetProps<string> & { error: string | null }) {
  return (
    <Sheet open={open} onClose={onClose} title="Name">
      <NameForm {...rest} />
    </Sheet>
  );
}

function NameForm({ initial, saving, error, onSave }: Omit<EditSheetProps<string>, "open" | "onClose"> & { error: string | null }) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSave(trimmed);
      }}
    >
      <TextField label="Your name" large autoFocus maxLength={40} value={value} onChange={(e) => setValue(e.target.value)} error={error} />
      <Button type="submit" fullWidth className="mt-6" disabled={!trimmed || saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}

function ColorSheet({ open, onClose, profile, ...rest }: EditSheetProps<Pastel> & { name: string; profile: Profile }) {
  return (
    <Sheet open={open} onClose={onClose} title="Photo and color">
      <p className="micro mb-2 text-ink-faded">Photo</p>
      <ProfilePhotoControls initialProfile={profile} />
      <p className="micro mb-2 mt-6 text-ink-faded">Color · shown around your photo, or behind your initials</p>
      <ColorForm {...rest} />
    </Sheet>
  );
}

function ColorForm({ name, initial, saving, onSave }: Omit<EditSheetProps<Pastel>, "open" | "onClose"> & { name: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ColorPicker name={name} value={value} onChange={setValue} />
      <Button fullWidth className="mt-6" disabled={saving} onClick={() => onSave(value)}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </>
  );
}

/** onSave(null) = "I don't use UPI". A saved UPI ID can be changed, not removed. */
type UpiProps = Omit<EditSheetProps<string | null>, "initial"> & { initial: string; error: string | null; optedOut: boolean };

function UpiSheet({ open, onClose, ...rest }: UpiProps) {
  return (
    <Sheet open={open} onClose={onClose} title="UPI ID">
      <UpiForm {...rest} />
    </Sheet>
  );
}

function UpiForm({ initial, saving, error, optedOut, onSave }: Omit<UpiProps, "open" | "onClose">) {
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState<string | null>(null);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) {
          setInvalid("Enter your UPI ID. It can be changed but not removed.");
          return;
        }
        if (!isValidUpiId(value)) {
          setInvalid("UPI IDs look like name@bank, e.g. vansh@okhdfcbank.");
          return;
        }
        onSave(normalizeUpiId(value));
      }}
    >
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
          setInvalid(null);
        }}
        error={invalid ?? error}
        hint={optedOut ? "You said you don't use UPI. Add an ID any time." : "Friends pay you back to this in one tap."}
      />
      <Button type="submit" fullWidth className="mt-6" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {!optedOut && (
        <Button type="button" variant="ghost" fullWidth className="mt-2" disabled={saving} onClick={() => onSave(null)}>
          I don&apos;t use UPI (living outside India)
        </Button>
      )}
    </form>
  );
}

function CurrencySheet({ open, onClose, ...rest }: EditSheetProps<CurrencyCode>) {
  return (
    <Sheet open={open} onClose={onClose} title="Default currency">
      <CurrencyForm {...rest} />
    </Sheet>
  );
}

function CurrencyForm({ initial, saving, onSave }: Omit<EditSheetProps<CurrencyCode>, "open" | "onClose">) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <CurrencyPicker value={value} onChange={setValue} />
      <Button fullWidth className="mt-6" disabled={saving} onClick={() => onSave(value)}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </>
  );
}

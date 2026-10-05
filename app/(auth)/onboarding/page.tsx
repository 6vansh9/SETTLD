import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/features/onboarding/OnboardingFlow";
import { getUserAndProfile } from "@/lib/auth";
import { startStep } from "@/lib/onboarding";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Welcome · Settld" };

export default async function OnboardingPage({ searchParams }: { searchParams: { next?: string; step?: string } }) {
  const next = safeNext(searchParams.next);
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/onboarding?${new URLSearchParams({ next })}`)}`);
  // getUserAndProfile creates missing profiles; this only happens if that insert failed.
  if (!profile) return <ProfileUnavailable next={next} />;
  if (profile.onboarded_at) redirect(next);

  // Phone prefill: mine if saved, else the one my inviter saved on the spot a personal claim link
  // points at (only that link's holder can read it; never used to claim anything).
  const supabase = createClient();
  const { data: mine } = await supabase.from("user_phones").select("phone").eq("user_id", user.id).maybeSingle();
  let initialPhone = mine?.phone ?? null;
  const token = /^\/join\/([A-Za-z0-9_-]{12,64})(?:[?#]|$)/.exec(next)?.[1];
  if (!initialPhone && token) {
    const { data } = await supabase.rpc("claim_link_phone", { p_token: token });
    initialPhone = data ?? null;
  }

  return (
    <OnboardingFlow
      initialProfile={profile}
      initialStep={startStep(searchParams.step, profile.name)}
      initialPhone={initialPhone}
      next={next}
    />
  );
}

function ProfileUnavailable({ next }: { next: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col items-center justify-center px-5 text-center">
      <p aria-hidden className="font-display text-[96px] uppercase leading-[0.85] text-ink-faded">
        Hold
        <br />
        on
      </p>
      <p className="mt-6 max-w-[280px] text-[15px] font-medium text-ink/60">
        We couldn&apos;t set up your profile just now. Give it a moment and try again.
      </p>
      <a
        href={`/onboarding?next=${encodeURIComponent(next)}`}
        className="mt-6 inline-flex h-14 items-center rounded-full bg-coral px-7 font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
      >
        Try again
      </a>
    </main>
  );
}

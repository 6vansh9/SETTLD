import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/features/onboarding/OnboardingFlow";
import { getUserAndProfile } from "@/lib/auth";
import { startStep } from "@/lib/onboarding";
import { safeNext } from "@/lib/redirect";

export const metadata = { title: "Welcome · Settld" };

export default async function OnboardingPage({ searchParams }: { searchParams: { next?: string; step?: string } }) {
  const next = safeNext(searchParams.next);
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/onboarding?${new URLSearchParams({ next })}`)}`);
  // getUserAndProfile creates missing profiles; this only happens if that insert failed.
  if (!profile) return <ProfileUnavailable next={next} />;
  if (profile.onboarded_at) redirect(next);

  return (
    <OnboardingFlow initialProfile={profile} initialStep={startStep(searchParams.step, profile.name)} next={next} />
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

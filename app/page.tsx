import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/features/auth/AuthPanel";
import { FannedCards } from "@/components/features/auth/FannedCards";
import { getUserAndProfile } from "@/lib/auth";

export default async function Landing() {
  const { user, profile } = await getUserAndProfile();
  if (user) redirect(profile?.onboarded_at ? "/groups" : "/onboarding");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col overflow-x-clip px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))]">
      <span className="micro">Settld</span>

      <h1 className="mt-6 font-display text-[clamp(96px,30vw,136px)] uppercase leading-[0.9]">
        <span className="block">Split</span>
        <span className="block text-ink-faded">it</span>
        <span className="block">Settld</span>
      </h1>

      <div className="flex flex-1 items-center py-6">
        <FannedCards />
      </div>

      <AuthPanel next="/groups" />
      <p className="micro mt-5 text-center text-ink-faded">Split trips, rent and dinners. Live.</p>
    </main>
  );
}

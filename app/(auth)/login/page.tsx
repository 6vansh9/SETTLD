import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/features/auth/AuthPanel";
import { Title } from "@/components/ui";
import { postSignInPath } from "@/lib/auth-redirect";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sign in · Settld" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = safeNext(searchParams.next);
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(await postSignInPath(supabase, next));

  // Arriving from an invite link: say so, so the redirect after sign-in isn't a surprise.
  const joining = next.startsWith("/join/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))]">
      <span className="micro">Settld</span>
      <div className="flex flex-1 flex-col justify-center">
        <Title line1={joining ? "SIGN IN" : "WELCOME"} line2={joining ? "TO JOIN" : "BACK"} size="xl" />
        <p className="mt-4 max-w-[300px] text-[15px] font-medium text-ink/70">
          {joining
            ? "You've been invited to a group. Sign in and we'll take you straight there."
            : "Sign in to see your groups and balances."}
        </p>
      </div>
      <AuthPanel next={next} error={searchParams.error} />
    </main>
  );
}

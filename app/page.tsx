import { ArrowRight, Globe2, QrCode, Smartphone, SplitSquareHorizontal } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FannedCards } from "@/components/features/auth/FannedCards";
import { Card } from "@/components/ui";
import { getUserAndProfile } from "@/lib/auth";
import type { Pastel } from "@/lib/pastels";

const FEATURES: { color: Pastel; Icon: typeof Globe2; title: string; body: string }[] = [
  { color: "pink", Icon: SplitSquareHorizontal, title: "Split any way", body: "Equally, exact amounts, percentages or shares. Several people can pay one bill." },
  { color: "sky", Icon: QrCode, title: "Join with a link", body: "Share a link or QR code. Friends join in seconds, no app store." },
  { color: "mint", Icon: Smartphone, title: "Settle with UPI", body: "One tap opens GPay, PhonePe or Paytm with the exact amount filled in." },
  { color: "butter", Icon: Globe2, title: "Any currency", body: "Rupees, dollars, euros, pounds. Rates are locked in when you add the expense." },
];

/** Public homepage. Signed-in people go straight to their groups. */
export default async function Home() {
  const { user, profile } = await getUserAndProfile();
  if (user) redirect(profile?.onboarded_at ? "/groups" : "/onboarding");

  return (
    <main className="mx-auto w-full max-w-app overflow-x-clip px-5 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex h-11 items-center justify-between">
        <span className="font-display text-[22px] uppercase leading-none">Settld</span>
        <Link
          href="/login"
          className="flex h-10 items-center rounded-full border-[1.5px] border-ink/15 px-4 text-[14px] font-semibold hover:bg-ink/5"
        >
          Sign in
        </Link>
      </header>

      <h1 className="mt-8 font-display text-[clamp(96px,30vw,136px)] uppercase leading-[0.9]">
        <span className="block">Split</span>
        <span className="block text-ink-faded">it</span>
        <span className="block">Settld</span>
      </h1>
      <p className="mt-5 max-w-[320px] text-[17px] font-medium text-ink/70">
        Split trips, rent and dinners with friends. Everyone sees the same numbers, and you pay back in one tap.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/signup"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-coral font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
        >
          Get started, it&apos;s free
          <ArrowRight className="size-5" strokeWidth={2.5} />
        </Link>
        <Link href="/login" className="flex h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold hover:bg-ink/5">
          I already have an account
        </Link>
      </div>

      <div className="py-10">
        <FannedCards />
      </div>

      <section aria-labelledby="how" className="space-y-3">
        <h2 id="how" className="font-display-alt text-[36px] uppercase leading-none">
          How it works
        </h2>
        {FEATURES.map(({ color, Icon, title, body }) => (
          <Card key={title} color={color}>
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-on-pastel/10">
                <Icon className="size-5" strokeWidth={2.25} aria-hidden />
              </span>
              <span>
                <span className="block font-display-alt text-[26px] uppercase leading-none">{title}</span>
                <span className="mt-2 block text-[15px] font-medium opacity-75">{body}</span>
              </span>
            </div>
          </Card>
        ))}
      </section>

      <section className="mt-12 rounded-card bg-ink p-6 text-bg">
        <p className="font-display text-[48px] uppercase leading-[0.9]">
          Ready to
          <br />
          <span className="opacity-50">settle?</span>
        </p>
        <Link
          href="/signup"
          className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-coral font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
        >
          Create your account
        </Link>
        <Link href="/login" className="mt-2 flex h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold opacity-80">
          Sign in
        </Link>
      </section>

      <p className="micro mt-8 text-center text-ink-faded">No passwords · Works on any phone · Free</p>
    </main>
  );
}

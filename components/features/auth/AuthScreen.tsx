import Link from "next/link";
import { AuthPanel, type AuthMode } from "@/components/features/auth/AuthPanel";
import { Title } from "@/components/ui";

/** Shared layout for /login and /signup. */
export function AuthScreen({ mode, next, error }: { mode: AuthMode; next: string; error?: string }) {
  const joining = next.startsWith("/join/") || next.startsWith("/room/");
  const other = mode === "signin" ? "/signup" : "/login";
  const keepNext = next !== "/groups" ? `?next=${encodeURIComponent(next)}` : "";

  const [line1, line2] =
    mode === "signup" ? (joining ? ["SIGN UP", "TO JOIN"] : ["CREATE", "ACCOUNT"]) : joining ? ["SIGN IN", "TO JOIN"] : ["WELCOME", "BACK"];
  const blurb = joining
    ? "You've been invited to a group. We'll take you straight there."
    : mode === "signup"
      ? "Free, and no password. Use Google or your email."
      : "Sign in to see your groups and balances.";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-app flex-col px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <header className="flex h-11 items-center justify-between">
        <Link href="/" className="micro">
          ← Settld
        </Link>
        <Link href={`${other}${keepNext}`} className="micro text-ink-faded hover:text-ink">
          {mode === "signin" ? "Create account" : "Sign in"}
        </Link>
      </header>

      <div className="flex flex-1 flex-col justify-center">
        <Title line1={line1} line2={line2} size="xl" />
        <p className="mt-4 max-w-[300px] text-[15px] font-medium text-ink/70">{blurb}</p>
      </div>

      <AuthPanel next={next} error={error} mode={mode} />

      <p className="mt-5 text-center text-[14px] font-medium text-ink/60">
        {mode === "signin" ? "New to Settld? " : "Already have an account? "}
        <Link href={`${other}${keepNext}`} className="font-semibold text-ink underline underline-offset-2">
          {mode === "signin" ? "Create an account" : "Sign in"}
        </Link>
      </p>
    </main>
  );
}

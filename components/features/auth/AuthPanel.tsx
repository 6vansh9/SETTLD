"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Sheet, Title } from "@/components/ui";
import { AUTH_ERROR_MESSAGES, googleSignInOptions, isAuthErrorCode, normalizeOtp } from "@/lib/auth-flow";
import { fade, spring } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_S = 60;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ?error= from the auth routes ("link" is the pre-fix name for an expired link). */
function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "link") return AUTH_ERROR_MESSAGES.expired;
  return isAuthErrorCode(code) ? AUTH_ERROR_MESSAGES[code] : AUTH_ERROR_MESSAGES.auth;
}

function callbackUrl(next: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

/** Continue with Google + Continue with email (magic link in a sheet). */
export function AuthPanel({ next, error }: { next: string; error?: string }) {
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(errorMessage(error));
  const [emailOpen, setEmailOpen] = useState(false);

  const google = async () => {
    setGoogleBusy(true);
    setMessage(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      // Always show Google's account chooser, so switching accounts never reuses the last one.
      options: googleSignInOptions(callbackUrl(next)),
    });
    // On success the browser navigates away; we only get here on failure.
    if (error) {
      setGoogleBusy(false);
      setMessage(
        /not enabled|unsupported provider/i.test(error.message)
          ? "Google sign-in isn't switched on yet. Use email for now."
          : error.message,
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button fullWidth onClick={google} disabled={googleBusy}>
        <GoogleMark />
        {googleBusy ? "Opening Google…" : "Continue with Google"}
      </Button>
      <Button variant="secondary" fullWidth className="h-14" onClick={() => setEmailOpen(true)}>
        <Mail className="size-5" strokeWidth={2.25} />
        Continue with email
      </Button>

      <AnimatePresence>
        {message && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-owe/10 px-4 py-3 text-center text-[14px] font-medium text-owe"
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>

      <EmailSheet open={emailOpen} onClose={() => setEmailOpen(false)} next={next} />
    </div>
  );
}

function EmailSheet({ open, onClose, next }: { open: boolean; onClose: () => void; next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const reduce = useReducedMotion();

  // The 6-digit code works anywhere: in the home-screen app (separate cookies from Safari) or when
  // the link would open in another browser (e.g. the Gmail app).
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = normalizeOtp(code);
    if (!token) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    setVerifying(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token, type: "email" });
    if (error) {
      setVerifying(false);
      setError(/expired/i.test(error.message) ? AUTH_ERROR_MESSAGES.expired : AUTH_ERROR_MESSAGES.code);
      return;
    }
    // Hard navigation: the server reads the new session cookie and sends you to onboarding or `next`.
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  };

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setError("That doesn't look like an email address.");
      return;
    }
    setStatus("sending");
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl(next) },
    });
    if (error) {
      setStatus("idle");
      setError(/rate limit|security purposes/i.test(error.message) ? "Too many tries. Wait a minute and try again." : error.message);
      return;
    }
    setStatus("sent");
    setCooldown(RESEND_COOLDOWN_S);
  };

  const close = () => {
    onClose();
    if (status === "sent") setStatus("idle");
  };

  return (
    <Sheet open={open} onClose={close} title="Continue with email" hideTitle>
      <AnimatePresence mode="wait" initial={false}>
        {status === "sent" ? (
          <motion.div
            key="sent"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={reduce ? fade : spring}
          >
            <Title line1="CHECK" line2="YOUR INBOX" size="md" as="h3" />
            <p className="mt-4 text-[15px] font-medium text-ink/70">
              We emailed <span className="font-semibold text-ink">{email.trim()}</span>. Tap the link in it, or
              enter the code from it here.
            </p>
            <form onSubmit={verifyCode} noValidate className="mt-6">
              <label htmlFor="otp" className="micro block text-ink-faded">
                Code from the email
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/[^\d\s]/g, ""));
                    setError(null);
                  }}
                  aria-invalid={!!error}
                  aria-describedby={error ? "otp-error" : undefined}
                  className="h-14 min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink/15 bg-bg px-4 text-center font-num text-[28px] tracking-[0.2em] text-ink placeholder:text-ink/20 focus:border-ink focus:outline-none"
                />
                <Button type="submit" className="h-14" disabled={verifying || !normalizeOtp(code)}>
                  {verifying ? "…" : "Sign in"}
                </Button>
              </div>
              {error && (
                <p id="otp-error" role="alert" className="mt-2 text-[13px] font-medium text-owe">
                  {error}
                </p>
              )}
            </form>
            <div className="mt-6 flex flex-col gap-3">
              <Button variant="secondary" fullWidth disabled={cooldown > 0} onClick={() => send()}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => {
                  setStatus("idle");
                  setCode("");
                  setError(null);
                }}
              >
                Use a different email
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={send}
            noValidate
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={reduce ? fade : spring}
          >
            <Title line1="WHAT'S YOUR" line2="EMAIL" size="md" as="h3" />
            <p className="mt-3 text-[15px] font-medium text-ink/70">No password. We&apos;ll email you a link.</p>
            <label htmlFor="email" className="micro mt-8 block text-ink-faded">
              Email
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "email-error" : undefined}
              className="mt-2 h-14 w-full rounded-2xl border-[1.5px] border-ink/15 bg-bg px-4 text-[17px] font-medium text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none"
            />
            {error && (
              <p id="email-error" role="alert" className="mt-2 text-[13px] font-medium text-owe">
                {error}
              </p>
            )}
            <Button type="submit" fullWidth className="mt-6" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send magic link"}
            </Button>
          </motion.form>
        )}
      </AnimatePresence>
    </Sheet>
  );
}

function GoogleMark() {
  return (
    <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-white">
    <svg viewBox="0 0 24 24" className="size-4">
      <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
    </span>
  );
}

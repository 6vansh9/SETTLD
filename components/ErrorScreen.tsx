"use client";

import { useEffect, useMemo, useState } from "react";
import { isChunkError, reloadOnce } from "@/lib/chunk-error";

/** What to paste into a bug report: the error, where, and on what browser. */
export function errorReport(error: Error & { digest?: string }, where: string, ua: string): string {
  const stack = (error.stack ?? "").split("\n").slice(0, 6).join("\n");
  return [
    `${error.name || "Error"}: ${error.message || String(error)}`,
    error.digest ? `digest: ${error.digest}` : null,
    `page: ${where}`,
    `browser: ${ua}`,
    `time: ${new Date().toISOString()}`,
    stack && !stack.startsWith(`${error.name}: ${error.message}`) ? stack : stack.split("\n").slice(1).join("\n"),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Settld-style crash screen (app/error.tsx, app/global-error.tsx): short message, the actual error
 * in a copyable box, Reload. Stale-deploy chunk errors reload once by themselves.
 */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [env, setEnv] = useState({ where: "", ua: "" });

  useEffect(() => {
    setEnv({ where: window.location.pathname + window.location.search, ua: navigator.userAgent });
    console.error(error);
    if (isChunkError(error) && reloadOnce()) setReloading(true);
  }, [error]);

  const report = useMemo(() => errorReport(error, env.where, env.ua), [error, env]);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(report);
      else {
        const el = document.getElementById("error-report") as HTMLTextAreaElement | null;
        el?.select();
        document.execCommand("copy");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      (document.getElementById("error-report") as HTMLTextAreaElement | null)?.select();
    }
  };

  return (
    <main className="mx-auto flex min-h-[100vh] w-full max-w-app flex-col justify-center px-5 py-10" style={{ minHeight: "100dvh" }}>
      <p aria-hidden className="font-display text-[96px] uppercase leading-[0.85] text-ink-faded">
        {reloading ? "One" : "Oops"}
        <br />
        {reloading ? "sec" : "Broke"}
      </p>
      <h1 className="mt-6 text-[20px] font-semibold">{reloading ? "Getting the latest version…" : "Something went wrong on this screen."}</h1>
      <p className="mt-2 text-[15px] font-medium text-ink/60">
        {reloading
          ? "Settld was updated while this page was open. Reloading."
          : "Reload usually fixes it. If it keeps happening, copy the details below and send them to us."}
      </p>

      {!reloading && (
        <>
          <label htmlFor="error-report" className="micro mt-6 text-ink-faded">
            Error details
          </label>
          <textarea
            id="error-report"
            readOnly
            value={report}
            rows={7}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full resize-none rounded-2xl border-[1.5px] border-ink/15 bg-surface p-3 font-mono text-[12px] leading-relaxed text-ink"
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copy}
              className="h-12 rounded-full border-[1.5px] border-ink/15 bg-surface text-[15px] font-semibold text-ink"
            >
              {copied ? "Copied" : "Copy details"}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-12 rounded-full bg-coral font-display-alt text-[20px] uppercase tracking-wide text-on-pastel"
            >
              Reload
            </button>
          </div>
          <div className="mt-3 flex justify-center gap-4 text-[14px] font-semibold text-ink/60">
            {reset && (
              <button type="button" onClick={reset} className="h-11 px-3">
                Try again
              </button>
            )}
            <a href="/groups" className="flex h-11 items-center px-3">
              Go to my groups
            </a>
          </div>
        </>
      )}
    </main>
  );
}

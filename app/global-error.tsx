"use client";

import { ErrorScreen } from "@/components/ErrorScreen";
import { compatScript } from "@/lib/compat";
import { themeScript } from "@/components/providers/ThemeProvider";
import "./globals.css";

/** Errors in the root layout itself: this replaces the whole document, so it brings its own. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: compatScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-bg font-sans text-ink antialiased">
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}

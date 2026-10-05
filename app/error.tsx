"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

/** Errors inside a page: the root layout (fonts, theme) still renders around this. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} />;
}

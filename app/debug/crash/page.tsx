"use client";

import { useEffect, useState } from "react";

/**
 * On-purpose crash for checking the error screen from a phone:
 *   /debug/crash               → a normal error (Settld error screen, copyable details)
 *   /debug/crash?kind=chunk    → a stale-deploy chunk error (reloads once, then the error screen)
 */
export default function CrashTest() {
  const [kind, setKind] = useState<string | null>(null);
  useEffect(() => setKind(new URLSearchParams(window.location.search).get("kind") ?? "plain"), []);
  if (kind === "chunk") {
    const e = new Error("Loading chunk 0 failed. (test error, on purpose)");
    e.name = "ChunkLoadError";
    throw e;
  }
  if (kind) throw new Error("Test error, on purpose: the error screen works.");
  return null;
}

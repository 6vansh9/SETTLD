"use client";

/** Runtime caches that can hold rendered pages with someone's data (see app/sw.ts). */
export const DATA_CACHES = ["settld-pages", "settld-rsc", "settld-photos"];

/** On sign-out / account switch: forget saved pages so the next person never sees them offline. */
export async function clearDataCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await Promise.all(DATA_CACHES.map((name) => caches.delete(name)));
  } catch {
    // cache storage unavailable: nothing saved anyway
  }
}

/** This build's id (baked in at build time) vs the one now deployed. */
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

export async function deployedSha(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { sha?: string }).sha ?? null;
  } catch {
    return null;
  }
}

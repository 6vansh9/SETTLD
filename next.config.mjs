import { randomUUID } from "node:crypto";
import withSerwistInit from "@serwist/next";

// Service worker (Milestone 9): app/sw.ts → public/sw.js at build time. Off in dev (stale caches
// make development confusing); the app registers it itself (lib/push-client.ts).
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  register: false,
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [{ url: "/~offline", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? randomUUID() }],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The running build's id, compared with /api/version to offer "New version · Reload".
  env: { NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BUILD_SHA ?? "dev" },
  // These ship modern syntax (e.g. ??=) that older iOS Safari can't parse; compile them down like
  // our own code (Next's default browser targets).
  transpilePackages: [
    "@tanstack/query-core",
    "@tanstack/react-query",
    "@supabase/ssr",
    "@supabase/supabase-js",
    "@supabase/auth-js",
    "@supabase/realtime-js",
    "@supabase/postgrest-js",
    "@supabase/storage-js",
    "@supabase/functions-js",
    "framer-motion",
  ],
  experimental: {
    // The OG image routes read the bundled TTFs from disk; make sure Vercel ships them.
    outputFileTracingIncludes: {
      "/api/og/**/*": ["./assets/fonts/**/*"],
    },
  },
};

export default withSerwist(nextConfig);

/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;

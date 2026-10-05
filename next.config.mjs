/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // The OG image routes read the bundled TTFs from disk; make sure Vercel ships them.
    outputFileTracingIncludes: {
      "/api/og/**/*": ["./assets/fonts/**/*"],
    },
  },
};

export default nextConfig;

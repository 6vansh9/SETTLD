import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/site";
import { Anton, Big_Shoulders_Display, Inter, Jersey_10 } from "next/font/google";
import { themeScript } from "@/components/providers/ThemeProvider";
import Script from "next/script";
import { compatScript } from "@/lib/compat";
import { splashScreens } from "@/lib/splash";
import { Providers } from "./providers";
import "./globals.css";

const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton" });
const bigShoulders = Big_Shoulders_Display({
  subsets: ["latin"],
  weight: "800",
  variable: "--font-big-shoulders",
});
// next/font has no fallback metrics for Jersey 10, so skip the size-adjusted fallback.
const jersey = Jersey_10({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-jersey",
  adjustFontFallback: false,
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  // Absolute URLs in metadata (Open Graph, icons) resolve against the public address.
  metadataBase: new URL(SITE_URL),
  title: "Settld",
  description: "Split it. Settle it. Shared expenses, live.",
  openGraph: { siteName: "Settld", type: "website", url: SITE_URL, title: "Settld", description: "Split it. Settle it. Shared expenses, live." },
  // Home Screen app on iPhone (standalone), which is also what enables Web Push there.
  appleWebApp: { capable: true, title: "Settld", statusBarStyle: "default", startupImage: splashScreens() },
  // Generated from public/brand/settld-icon-pixel.svg by scripts/build-icons.mjs.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/brand/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F1EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0E0E" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${anton.variable} ${bigShoulders.variable} ${jersey.variable} ${inter.variable}`}
    >
      <head>
        {/* Older iOS Safari: polyfills + reload once on stale chunks. Must run before anything else. */}
        <Script id="settld-compat" strategy="beforeInteractive">
          {compatScript}
        </Script>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Anton, Big_Shoulders_Display, Inter, Jersey_10 } from "next/font/google";
import { themeScript } from "@/components/providers/ThemeProvider";
import Script from "next/script";
import { compatScript } from "@/lib/compat";
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
  title: "Settld",
  description: "Split it. Settle it. Shared expenses, live.",
  // Home Screen app on iPhone (standalone), which is also what enables Web Push there.
  appleWebApp: { capable: true, title: "Settld", statusBarStyle: "default" },
  icons: { apple: [{ url: "/pwa-icon/180", sizes: "180x180" }] },
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

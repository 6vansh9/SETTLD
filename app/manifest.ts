import type { MetadataRoute } from "next";

/** Web app manifest: needed for Add to Home Screen (standalone) and therefore iPhone Web Push. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Settld",
    short_name: "Settld",
    description: "Split it. Settle it. Shared expenses, live.",
    start_url: "/groups",
    scope: "/",
    display: "standalone",
    background_color: "#F4F1EC",
    theme_color: "#EE6A4B",
    // Generated from public/brand/settld-icon-pixel.svg by scripts/build-icons.mjs.
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/** Crisp SVG QR code, dark on white so every camera can read it. */
export function QrCode({ value, className, label }: { value: string; className?: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0E0E0E", light: "#FFFFFF" } })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("aspect-square rounded-[20px] bg-white p-4 [&_svg]:h-full [&_svg]:w-full", className)}
      // Generated locally by the qrcode package from our own URL.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

"use client";

export type ShareImageResult = "shared" | "downloaded" | "cancelled" | "failed";

/**
 * Share an image file (receipt) through the native share sheet: on iPhone that's where WhatsApp
 * and Instagram (Stories) appear. Falls back to downloading the PNG where file sharing isn't supported.
 */
export async function shareImage(url: string, filename: string, title: string): Promise<ShareImageResult> {
  let blob: Blob;
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return "failed";
    blob = await res.blob();
  } catch {
    return "failed";
  }
  const file = new File([blob], filename, { type: blob.type || "image/png" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return "downloaded";
}

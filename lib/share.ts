"use client";

/** Copy text, falling back to a hidden textarea where the async Clipboard API isn't available. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/** Web Share API with the native sheet, falling back to copying the text. */
export async function shareOrCopy(data: { title: string; text: string; url: string }): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      // The URL is already at the end of the text; passing it separately duplicates it in WhatsApp.
      await navigator.share({ title: data.title, text: data.text });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(data.text)) ? "copied" : "failed";
}

/**
 * Photos: crop maths (pure, tested), decoding (incl. iPhone HEIC where the browser can), resizing +
 * WebP/JPEG encoding in the browser, upload with progress to Supabase Storage, and cleanup.
 */

export type PhotoKind = "avatar" | "cover";

export const PHOTO_SPECS: Record<PhotoKind, { bucket: string; width: number; height: number; shape: "round" | "wide" }> = {
  avatar: { bucket: "avatars", width: 256, height: 256, shape: "round" },
  cover: { bucket: "group-covers", width: 1200, height: 600, shape: "wide" },
};

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // bucket limit (0008_photos.sql)
export const MAX_ZOOM = 4;

/**
 * Group covers show the photo in its real colors with a light wash of the group color, and a dark
 * gradient scrim behind the text (white text on covers). The scrim stops are the darkness behind
 * each band of text; lib/images.test.ts proves WCAG AA over a pure white photo (the worst case for
 * white text), a pure black one and mid tones:
 *  • COVER_TINT   light on-brand wash of the group color over the whole photo
 *  • SCRIM_TITLE  behind the big name (large text, 3:1)
 *  • SCRIM_TEXT   behind labels, amounts and members (normal text at 60% white, 4.5:1)
 */
export const COVER_TINT = 0.12;
export const SCRIM_TITLE = 0.6;
export const SCRIM_TEXT = 0.75;
/** Faded text on covers (decimals, ₹, secondary labels). */
export const COVER_FADED = 0.6;

const black = (a: number) => `rgb(0 0 0 / ${a})`;

/**
 * Header scrim (px stops from the top): clear sky behind the nav, darkening by the title, full
 * strength from the labels down, then a short fade into the group's pastel where it meets the page.
 */
export function headerScrim(pastel: string, fadePx = 36): string {
  return `linear-gradient(to bottom, ${black(0)} 0px, ${black(0.3)} 56px, ${black(SCRIM_TITLE)} 128px, ${black(SCRIM_TEXT)} 200px, ${black(SCRIM_TEXT)} calc(100% - ${fadePx}px), ${pastel} 100%)`;
}

/** Card strip scrim: the avatar row and date sit at the bottom of the strip, then a fade to pastel. */
export function stripScrim(pastel: string): string {
  return `linear-gradient(to bottom, ${black(0.15)} 0%, ${black(SCRIM_TEXT)} 45%, ${black(SCRIM_TEXT)} calc(100% - 14px), ${pastel} 100%)`;
}

export interface CropState {
  zoom: number; // 1 = the largest crop of the output's aspect ratio that fits
  cx: number; // crop centre, source pixels
  cy: number;
}
export interface Rect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Crop size for an aspect ratio at a zoom: zoom 1 covers as much of the image as possible. */
export function cropSize(srcW: number, srcH: number, aspect: number, zoom: number): { w: number; h: number } {
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom));
  const baseW = Math.min(srcW, srcH * aspect);
  const baseH = baseW / aspect;
  return { w: baseW / z, h: baseH / z };
}

/** Keep the crop inside the image. */
export function clampCrop(srcW: number, srcH: number, aspect: number, s: CropState): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, s.zoom));
  const { w, h } = cropSize(srcW, srcH, aspect, zoom);
  return {
    zoom,
    cx: Math.min(srcW - w / 2, Math.max(w / 2, s.cx)),
    cy: Math.min(srcH - h / 2, Math.max(h / 2, s.cy)),
  };
}

export function initialCrop(srcW: number, srcH: number): CropState {
  return { zoom: 1, cx: srcW / 2, cy: srcH / 2 };
}

export function cropRect(srcW: number, srcH: number, aspect: number, s: CropState): Rect {
  const c = clampCrop(srcW, srcH, aspect, s);
  const { w, h } = cropSize(srcW, srcH, aspect, c.zoom);
  return { sx: c.cx - w / 2, sy: c.cy - h / 2, sw: w, sh: h };
}

/** Drag by (dx, dy) screen pixels in a viewport `viewW` wide: the image follows the finger. */
export function panBy(srcW: number, srcH: number, aspect: number, s: CropState, dx: number, dy: number, viewW: number): CropState {
  const { w } = cropSize(srcW, srcH, aspect, s.zoom);
  const k = w / viewW; // source px per screen px
  return clampCrop(srcW, srcH, aspect, { ...s, cx: s.cx - dx * k, cy: s.cy - dy * k });
}

/** Zoom around the current centre. */
export function zoomTo(srcW: number, srcH: number, aspect: number, s: CropState, zoom: number): CropState {
  return clampCrop(srcW, srcH, aspect, { ...s, zoom });
}

export function isHeic(file: Blob & { name?: string }): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? "");
}

/** Storage path → public URL, and back. Paths are "<folder uuid>/<uuid>.<ext>". */
export function publicUrl(supabaseUrl: string, bucket: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`;
}
export function pathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const m = new RegExp(`/storage/v1/object/public/${bucket}/([0-9a-f-]{36}/[0-9a-f-]{36}\\.(?:webp|jpg))$`).exec(url);
  return m ? m[1] : null;
}

// ------------------------------------------------------------------------------------------------
// Browser-only below
// ------------------------------------------------------------------------------------------------

export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Object URL for showing it in the cropper. */
  url: string;
  close: () => void;
}

/**
 * Decode a picked photo. iPhone: Safari hands over JPEG from Photos/camera for accept="image/*",
 * and decodes HEIC itself when it gets one. EXIF orientation is applied (from-image).
 */
export async function loadImage(blob: Blob & { name?: string }): Promise<LoadedImage> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty");
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, url, close: () => URL.revokeObjectURL(url) };
  } catch {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, url, close: () => (bmp.close(), URL.revokeObjectURL(url)) };
    } catch {
      URL.revokeObjectURL(url);
      throw new Error(
        isHeic(blob)
          ? "This browser can't open HEIC photos. On iPhone, pick it from Photos in Safari, or use a JPEG."
          : "That file isn't a photo we can open. Try a JPEG or PNG.",
      );
    }
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Draw the crop at the output size and encode: WebP ~80%, JPEG where WebP encoding isn't supported. */
export async function renderCrop(img: LoadedImage, rect: Rect, outW: number, outH: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare the photo.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff"; // JPEG has no alpha: transparent PNGs get white, not black
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img.source, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, outW, outH);
  for (const q of [0.8, 0.65, 0.5]) {
    const webp = await toBlob(canvas, "image/webp", q);
    const out = webp && webp.type === "image/webp" ? webp : await toBlob(canvas, "image/jpeg", q);
    if (out && out.size <= MAX_UPLOAD_BYTES) return out;
  }
  throw new Error("That photo is too large even after compressing.");
}

/** Upload to Storage with progress (supabase-js has no progress events, so plain XHR). */
export function uploadWithProgress(opts: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string;
  bucket: string;
  path: string;
  blob: Blob;
  onProgress?: (fraction: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${opts.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${opts.bucket}/${opts.path}`);
    xhr.setRequestHeader("authorization", `Bearer ${opts.accessToken}`);
    xhr.setRequestHeader("apikey", opts.anonKey);
    xhr.setRequestHeader("content-type", opts.blob.type);
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = "Upload failed. Try again.";
      try {
        const body = JSON.parse(xhr.responseText);
        if (/row-level security|unauthorized/i.test(body.message ?? body.error ?? "")) message = "You can't change this photo.";
        else if (/size|too large|payload/i.test(body.message ?? "")) message = "That photo is too large.";
      } catch {
        // keep the generic message
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("You're offline. Check your connection and try again."));
    xhr.send(opts.blob);
  });
}

export function extensionFor(blob: Blob): "webp" | "jpg" {
  return blob.type === "image/webp" ? "webp" : "jpg";
}

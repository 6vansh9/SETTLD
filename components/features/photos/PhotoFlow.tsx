"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  cropRect,
  extensionFor,
  initialCrop,
  loadImage,
  MAX_ZOOM,
  panBy,
  PHOTO_SPECS,
  publicUrl,
  renderCrop,
  uploadWithProgress,
  zoomTo,
  type CropState,
  type LoadedImage,
  type PhotoKind,
} from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { uuid } from "@/lib/uuid";

/**
 * Pick → crop (drag to move, slider to zoom; round mask for avatars, wide for covers) → resize +
 * encode in the browser → upload with progress. Calls onUploaded with the new public URL; the
 * caller saves it and removes the old file.
 *
 * usage: const flow = usePhotoFlow({ kind, folder, onUploaded }); <button onClick={flow.pick} />; {flow.element}
 */
export function usePhotoFlow({ kind, folder, onUploaded }: { kind: PhotoKind; folder: string; onUploaded: (url: string) => Promise<void> | void }) {
  const input = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(() => {
    setError(null);
    input.current?.click();
  }, []);
  const fromBlob = useCallback((b: Blob) => {
    setError(null);
    setBlob(b);
  }, []);

  const element = (
    <>
      <input
        ref={input}
        type="file"
        // image/* (not a list of types): iPhone then offers Photos, Camera and Files, and converts HEIC to JPEG.
        accept="image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) setBlob(f);
        }}
      />
      <Sheet open={!!blob} onClose={() => setBlob(null)} title={kind === "avatar" ? "Profile photo" : "Group background"}>
        {blob && <CropBody kind={kind} folder={folder} blob={blob} onCancel={() => setBlob(null)} onUploaded={onUploaded} onDone={() => setBlob(null)} onError={setError} />}
      </Sheet>
    </>
  );
  return { pick, fromBlob, element, error, clearError: () => setError(null) };
}

function CropBody({
  kind,
  folder,
  blob,
  onCancel,
  onUploaded,
  onDone,
  onError,
}: {
  kind: PhotoKind;
  folder: string;
  blob: Blob;
  onCancel: () => void;
  onUploaded: (url: string) => Promise<void> | void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const spec = PHOTO_SPECS[kind];
  const aspect = spec.width / spec.height;
  const [img, setImg] = useState<LoadedImage | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const view = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const [viewW, setViewW] = useState(320);

  useEffect(() => {
    let alive = true;
    let loaded: LoadedImage | null = null;
    loadImage(blob)
      .then((l) => {
        loaded = l;
        if (!alive) return l.close();
        setImg(l);
        setCrop(initialCrop(l.width, l.height));
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
      loaded?.close();
    };
  }, [blob]);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setViewW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [img]);

  if (loadError) {
    return (
      <div className="py-4 text-center">
        <p role="alert" className="text-[15px] font-medium text-owe-ink">
          {loadError}
        </p>
        <Button variant="secondary" className="mt-5" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }
  if (!img || !crop) return <div className="aspect-square w-full animate-pulse rounded-card bg-ink/5" />;

  const rect = cropRect(img.width, img.height, aspect, crop);
  const scale = viewW / rect.sw; // screen px per source px
  const busy = progress !== null;

  const save = async () => {
    setFailure(null);
    setProgress(0);
    try {
      const out = await renderCrop(img, rect, spec.width, spec.height);
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sign in again to upload.");
      const path = `${folder}/${uuid()}.${extensionFor(out)}`;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      await uploadWithProgress({
        supabaseUrl: url,
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        accessToken: data.session.access_token,
        bucket: spec.bucket,
        path,
        blob: out,
        onProgress: (f) => setProgress(Math.min(0.95, f)),
      });
      setProgress(1);
      await onUploaded(publicUrl(url, spec.bucket, path));
      onDone();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed. Try again.";
      setFailure(message);
      onError(message);
      setProgress(null);
    }
  };

  return (
    <div>
      <div
        ref={view}
        className={cn("relative w-full touch-none select-none overflow-hidden bg-ink/90", kind === "avatar" ? "aspect-square rounded-card" : "aspect-[2/1] rounded-2xl")}
        onPointerDown={(e) => {
          if (busy) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          setCrop((c) => (c ? panBy(img.width, img.height, aspect, c, e.clientX - d.x, e.clientY - d.y, viewW) : c));
          drag.current = { ...d, x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => setCrop((c) => (c ? zoomTo(img.width, img.height, aspect, c, c.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06)) : c))}
        aria-label="Drag to reposition"
        role="application"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL being cropped */}
        <img
          src={img.url}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
          style={{ width: img.width * scale, height: img.height * scale, transform: `translate(${-rect.sx * scale}px, ${-rect.sy * scale}px)` }}
        />
        {kind === "avatar" ? (
          <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgb(14_14_14/0.55)]" aria-hidden />
        ) : (
          <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-inset ring-white/70" aria-hidden />
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => setCrop((c) => (c ? zoomTo(img.width, img.height, aspect, c, c.zoom - 0.25) : c))}
          className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-ink/15"
        >
          <Minus className="size-4" />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          aria-label="Zoom"
          disabled={busy}
          onChange={(e) => setCrop((c) => (c ? zoomTo(img.width, img.height, aspect, c, Number(e.target.value)) : c))}
          className="h-10 flex-1 accent-[color:var(--coral)]"
        />
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => setCrop((c) => (c ? zoomTo(img.width, img.height, aspect, c, c.zoom + 0.25) : c))}
          className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-ink/15"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <p className="mt-2 text-center text-[13px] font-medium text-ink/60">Drag to move · slide to zoom</p>

      {busy && (
        <div className="mt-4" role="progressbar" aria-label="Uploading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-coral transition-[width] duration-200" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
          <p className="mt-1 text-center text-[12px] font-semibold text-ink/60">Uploading… {Math.round((progress ?? 0) * 100)}%</p>
        </div>
      )}
      {failure && (
        <p role="alert" className="mt-3 text-center text-[13px] font-medium text-owe-ink">
          {failure}
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

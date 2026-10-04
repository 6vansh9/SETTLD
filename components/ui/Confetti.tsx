"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const PIECES = 140;
const DURATION_MS = 1800;

/**
 * One confetti burst (PRD › Motion) each time `burst` changes to a new non-zero value.
 * Colors are CSS colors (pass the group's pastels). Nothing renders under reduced motion.
 */
export function Confetti({ burst, colors }: { burst: number; colors: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  // Portal only after mount (server and first client render must match).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!burst || reduce || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Resolve CSS variables (e.g. var(--pink)) to real colors once.
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const palette = colors.map((c) => {
      probe.style.color = c;
      return getComputedStyle(probe).color;
    });
    probe.remove();

    const pieces = Array.from({ length: PIECES }, (_, i) => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const speed = 9 + Math.random() * 9;
      return {
        x: w / 2 + (Math.random() - 0.5) * 60,
        y: h * 0.62,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: palette[i % palette.length],
        circle: Math.random() < 0.3,
      };
    });

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DURATION_MS * 0.6) / (DURATION_MS * 0.4));
      for (const p of pieces) {
        p.vy += 0.38;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.circle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < DURATION_MS) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    // colors is a fresh array per render; re-run only per burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burst, reduce, mounted]);

  if (!mounted || reduce) return null;
  return createPortal(
    <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[70] h-full w-full" />,
    document.body,
  );
}

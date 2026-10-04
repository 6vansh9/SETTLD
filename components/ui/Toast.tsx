"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fade, spring } from "@/lib/motion";

export interface ToastData {
  id: string;
  message: string;
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss after this many ms (default 4000). */
  duration?: number;
}

/**
 * One toast at a time, floating above the bottom of the screen (and the SETTLE UP footer).
 * A thin bar shows the time left; the action (e.g. Undo) is only offered while it's visible.
 */
export function Toast({ toast, onDismiss, offset = 104 }: { toast: ToastData | null; onDismiss: () => void; offset?: number }) {
  const reduce = useReducedMotion();
  const duration = toast?.duration ?? 4000;
  // Portal only after mount: the server has no document, and rendering differently there breaks hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [toast, duration, onDismiss]);

  if (!mounted) return null;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] mx-auto flex max-w-app justify-center px-5"
      style={{ bottom: `calc(${offset}px + env(safe-area-inset-bottom))` }}
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            aria-live="polite"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={reduce ? fade : spring}
            className="pointer-events-auto relative w-full overflow-hidden rounded-2xl bg-ink text-bg"
          >
            <div className="flex min-h-14 items-center gap-3 px-4 py-2">
              <p className="flex-1 text-[14px] font-medium">{toast.message}</p>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action!.onClick();
                    onDismiss();
                  }}
                  className="h-10 rounded-full bg-bg px-4 text-[14px] font-semibold text-ink"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            {!reduce && (
              <motion.span
                aria-hidden
                className="absolute bottom-0 left-0 h-[3px] bg-coral"
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: duration / 1000, ease: "linear" }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

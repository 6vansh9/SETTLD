"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Numpad } from "@/components/ui";
import type { CurrencyCode } from "@/lib/money";
import { fade, spring } from "@/lib/motion";

/** Full-screen amount entry (PRD › Signature components › Amount input). */
export function AmountOverlay({
  open,
  currency,
  initialMinor,
  label,
  onDone,
  onClose,
}: {
  open: boolean;
  currency: CurrencyCode;
  initialMinor: number;
  label?: string;
  onDone: (minor: number) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Enter amount"
          className="fixed inset-0 z-[55] flex justify-center bg-bg pt-[env(safe-area-inset-top)]"
          initial={reduce ? { opacity: 0 } : { y: "100%" }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: "100%" }}
          transition={reduce ? fade : spring}
        >
          <div className="flex h-full w-full max-w-app flex-col">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex size-12 items-center justify-center rounded-full hover:bg-ink/5"
              >
                <X className="size-6" />
              </button>
            </div>
            <Numpad
              currency={currency}
              initialMinor={BigInt(initialMinor)}
              label={label}
              doneLabel="Next"
              onDone={(minor) => onDone(Number(minor))}
              className="flex-1"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

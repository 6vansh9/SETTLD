"use client";

import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { fade, spring } from "@/lib/motion";

const DISMISS_OFFSET = 120;
const SIDE_PADDING = "pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))]";
const DISMISS_VELOCITY = 500;
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; also rendered as a micro label unless hideTitle is set. */
  title: string;
  hideTitle?: boolean;
  /** Fixed above the scrolling body (e.g. the amount): always fully visible. */
  header?: React.ReactNode;
  /** Fixed below the scrolling body (e.g. Save): never covers content, clears the home indicator. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Bottom sheet: spring in, drag down to dismiss, backdrop, focus trap, safe-area aware. */
export function Sheet(props: SheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>{props.open && <SheetPanel {...props} />}</AnimatePresence>,
    document.body,
  );
}

function SheetPanel({ onClose, title, hideTitle, header, footer, children, className }: SheetProps) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Drag-to-dismiss starts only from the handle, so scrolling a long sheet never drags it.
  const dragControls = useDragControls();

  // Focus trap, Escape to close, scroll lock, and focus restore.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    // Focus the dialog itself (not its first button, which might be destructive),
    // unless a field inside already took focus via autoFocus.
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <motion.div
        className="absolute inset-0 bg-black/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          // Three regions: fixed top (handle, title, header) · scrolling body · fixed footer.
          // Height is capped below the safe area so the top edge never slides under the notch.
          "relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-12px))] w-full max-w-app flex-col overflow-hidden rounded-t-[28px] border-[1.5px] border-b-0 border-ink/[0.08] bg-surface text-ink outline-none",
          className,
        )}
        initial={reduce ? { opacity: 0 } : { y: "100%" }}
        animate={reduce ? { opacity: 1 } : { y: 0 }}
        exit={reduce ? { opacity: 0 } : { y: "100%" }}
        transition={reduce ? fade : spring}
        drag={reduce ? false : "y"}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={onDragEnd}
      >
        <div className={cn("shrink-0", SIDE_PADDING)}>
          <div
            aria-hidden
            onPointerDown={(e) => !reduce && dragControls.start(e)}
            className="-mx-5 mb-1 flex cursor-grab touch-none justify-center pb-3 pt-3 active:cursor-grabbing"
          >
            <span className="h-1.5 w-10 rounded-full bg-ink/15" />
          </div>
          <h2 id={titleId} className={cn("micro mb-4 text-ink-faded", hideTitle && "sr-only")}>
            {title}
          </h2>
          {header && <div className="pb-3">{header}</div>}
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            SIDE_PADDING,
            // Without a footer the body itself must clear the home indicator.
            footer ? "pb-4" : "pb-[calc(20px+env(safe-area-inset-bottom))]",
          )}
        >
          {children}
        </div>
        {footer && (
          <div className={cn("shrink-0 border-t-[1.5px] border-ink/[0.06] bg-surface pt-3", SIDE_PADDING, "pb-[calc(12px+env(safe-area-inset-bottom))]")}>
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
}

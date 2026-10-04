import type { Transition } from "framer-motion";

/** The one spring used across Settld (PRD.md › Motion). */
export const spring: Transition = { type: "spring", stiffness: 400, damping: 30 };

/** Reduced-motion replacement: a short fade instead of a spring. */
export const fade: Transition = { duration: 0.15, ease: "easeOut" };

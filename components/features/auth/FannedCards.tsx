"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Amount, AvatarStack } from "@/components/ui";
import { spring } from "@/lib/motion";
import { pastelVar, type Pastel } from "@/lib/pastels";

const CARDS: { name: string; color: Pastel; amount: number; label: string; rotate: number; x: number }[] = [
  { name: "FLAT 4B", color: "sky", amount: 1240000, label: "Rent · Oct", rotate: -7, x: -30 },
  { name: "DINNER CLUB", color: "mint", amount: 86025, label: "Thalassa", rotate: 6, x: 30 },
  { name: "GOA TRIP", color: "pink", amount: 340050, label: "6 friends", rotate: -2, x: 0 },
];

const PEOPLE = [
  { name: "Aman Rao", color: "sky" as const },
  { name: "Rahul Mehta", color: "mint" as const },
  { name: "Priya Shah", color: "butter" as const },
];

/** Three pastel group cards fanned out under the landing title. */
export function FannedCards() {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden className="relative mx-auto h-[220px] w-full max-w-[340px]">
      {CARDS.map((c, i) => (
        <motion.div
          key={c.name}
          className="absolute inset-x-8 top-4 rounded-card border-[1.5px] border-on-pastel/[0.08] p-5 text-on-pastel"
          style={{ backgroundColor: pastelVar(c.color), zIndex: i }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 60, rotate: 0, x: 0 }}
          animate={{ opacity: 1, y: 0, rotate: c.rotate, x: c.x }}
          transition={reduce ? { duration: 0.2 } : { ...spring, delay: 0.15 + i * 0.08 }}
        >
          <div className="flex items-start justify-between">
            <div style={{ "--avatar-ring": pastelVar(c.color) } as React.CSSProperties}>
              <AvatarStack people={PEOPLE} size="sm" />
            </div>
            <span className="micro opacity-60">{c.label}</span>
          </div>
          <p className="mt-4 font-display-alt text-[32px] uppercase leading-[0.9]">{c.name}</p>
          <div className="mt-4 flex justify-end">
            <Amount amount={c.amount} currency="INR" size="md" unblurrable />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

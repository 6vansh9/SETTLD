"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Amount, type AmountProps } from "./Amount";

/**
 * <Amount /> that counts up/down to a new value (PRD › Motion: numbers count up when balances
 * change). Whole minor units at every frame; jumps straight to the value under reduced motion.
 */
export function AnimatedAmount({ amount, ...rest }: AmountProps) {
  const reduce = useReducedMotion();
  const target = Number(amount);
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (reduce || shownRef.current === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const controls = animate(shownRef.current, target, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        shownRef.current = Math.round(v);
        setShown(shownRef.current);
      },
      onComplete: () => {
        shownRef.current = target;
        setShown(target);
      },
    });
    return () => controls.stop();
  }, [target, reduce]);

  return <Amount {...rest} amount={shown} />;
}

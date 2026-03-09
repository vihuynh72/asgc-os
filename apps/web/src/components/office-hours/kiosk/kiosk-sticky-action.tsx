"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export function KioskStickyAction({
  status,
  primary,
  secondary,
  hint,
  className,
}: {
  status?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  hint?: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("kiosk-sticky-wrap", className)}
    >
      <div className="kiosk-sticky-action">
        {status ? <div className="kiosk-sticky-status">{status}</div> : null}
        <div className="kiosk-sticky-primary">{primary}</div>
        {secondary ? <div className="kiosk-sticky-secondary">{secondary}</div> : null}
        {hint ? <p className="kiosk-sticky-hint">{hint}</p> : null}
      </div>
    </motion.div>
  );
}

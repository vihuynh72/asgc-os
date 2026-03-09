"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export function KioskStepHeader({
  eyebrow,
  title,
  subtitle,
  step,
  totalSteps,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  step: number;
  totalSteps: number;
  actions?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const safeStep = Math.max(1, Math.min(step, totalSteps));

  return (
    <motion.header
      className="kiosk-step-header"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: "easeOut" }}
    >
      <div className="space-y-2">
        {eyebrow ? <p className="kiosk-eyebrow">{eyebrow}</p> : null}
        <h1 className="kiosk-title">{title}</h1>
        {subtitle ? <p className="kiosk-subtitle">{subtitle}</p> : null}
      </div>

      <div className="kiosk-step-meta">
        <div className="kiosk-step-dots" aria-label={`Step ${safeStep} of ${totalSteps}`}>
          {Array.from({ length: totalSteps }).map((_, idx) => {
            const active = idx + 1 <= safeStep;
            return <span key={idx} className={active ? "kiosk-step-dot kiosk-step-dot-active" : "kiosk-step-dot"} />;
          })}
        </div>
        {actions ? <div className="kiosk-step-actions">{actions}</div> : null}
      </div>
    </motion.header>
  );
}

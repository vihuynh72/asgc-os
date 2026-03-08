"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export function AdminHero({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string | null;
  title: string;
  description: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.section
      className="admin-hero"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: "easeOut" }}
    >
      <div className="space-y-4">
        {eyebrow ? <div className="admin-eyebrow">{eyebrow}</div> : null}
        <div className="space-y-2">
          <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-foreground sm:text-[2.55rem]">{title}</h1>
          <p className="max-w-4xl text-base leading-8 text-foreground/66">{description}</p>
        </div>
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.section>
  );
}

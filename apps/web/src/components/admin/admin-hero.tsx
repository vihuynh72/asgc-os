"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

export function AdminHero({
  eyebrow = "Admin",
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
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
        <div className="admin-eyebrow">{eyebrow}</div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-foreground/66 sm:text-[0.97rem]">{description}</p>
        </div>
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.section>
  );
}

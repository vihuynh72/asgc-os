"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";

export function AdminFilterTray({
  title = "Filters",
  description,
  open,
  onToggle,
  children,
}: {
  title?: string;
  description?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="admin-filter-tray">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium">{title}</div>
          {description ? <p className="text-sm text-foreground/60">{description}</p> : null}
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle}>
          {open ? "Hide filters" : "Show filters"}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={reduceMotion ? undefined : { opacity: 1, height: "auto" }}
            exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-4">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

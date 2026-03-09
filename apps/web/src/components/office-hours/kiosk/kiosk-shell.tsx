"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

export function KioskShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute("data-kiosk");
    html.setAttribute("data-kiosk", "true");
    return () => {
      if (previous === null) html.removeAttribute("data-kiosk");
      else html.setAttribute("data-kiosk", previous);
    };
  }, []);

  return (
    <div className="kiosk-shell">
      <div aria-hidden className="kiosk-shell-backdrop" />
      <motion.main
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: "easeOut" }}
        className={cn("kiosk-shell-main", className)}
      >
        {children}
      </motion.main>
    </div>
  );
}

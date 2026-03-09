"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { getKioskTopNavModel } from "@/lib/office-hours-kiosk/top-nav.mjs";

export function KioskTopNav() {
  const reduceMotion = useReducedMotion();
  const nav = getKioskTopNavModel();

  return (
    <motion.nav
      aria-label={`${nav.pageLabel} kiosk navigation`}
      className="kiosk-top-nav"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: "easeOut" }}
    >
      <Link href={nav.homeHref} className="kiosk-top-nav-brand" aria-label="Go to home">
        <span className="kiosk-top-nav-mark" aria-hidden="true">
          {nav.brandMark}
        </span>
        <span className="kiosk-top-nav-copy">
          <span className="kiosk-top-nav-title">{nav.brandLabel}</span>
          <span className="kiosk-top-nav-subtitle">{nav.pageLabel}</span>
        </span>
      </Link>

      <Link href={nav.action.href} className="kiosk-top-nav-action">
        {nav.action.label}
      </Link>
    </motion.nav>
  );
}

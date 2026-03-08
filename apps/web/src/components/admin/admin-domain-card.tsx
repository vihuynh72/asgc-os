"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

export function AdminDomainCard({
  href,
  title,
  status,
  description,
  badge,
  primaryLabel,
}: {
  href: string;
  title: string;
  status?: string;
  description?: string | null;
  badge?: string | null;
  primaryLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const lead = status ?? description ?? "Open this workspace.";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <Link href={href} className="admin-domain-card">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-[1.45rem] font-semibold tracking-[-0.04em] text-foreground">{title}</h2>
              <p className="max-w-2xl text-base leading-7 text-foreground/78">{lead}</p>
            </div>
            {description && status ? <p className="max-w-2xl text-sm leading-7 text-foreground/58">{description}</p> : null}
          </div>
          {badge ? <span className="admin-domain-badge">{badge}</span> : null}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <span className="admin-domain-cta">{primaryLabel ?? "Open workspace"}</span>
        </div>
      </Link>
    </motion.div>
  );
}

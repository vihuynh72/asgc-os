"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { AdminStatusChip } from "./admin-status-chip";
import type { AdminStatusIconName, AdminStatusTone } from "./admin-types";

export function AdminDomainCard({
  href,
  title,
  status,
  statusShort,
  statusTone = "neutral",
  statusIcon = "dot",
  count = 0,
  description,
  badge,
  primaryLabel,
}: {
  href: string;
  title: string;
  status?: string;
  statusShort?: string;
  statusTone?: AdminStatusTone;
  statusIcon?: AdminStatusIconName;
  count?: number;
  description?: string | null;
  badge?: string | null;
  primaryLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const lead = statusShort ?? status ?? "Ready";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <Link href={href} className="admin-domain-card">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-[1.5rem] font-semibold tracking-[-0.04em] text-foreground">{title}</h2>
            <p className="text-base leading-7 text-foreground/72">{lead}</p>
          </div>
          <AdminStatusChip
            tone={statusTone}
            icon={statusIcon}
            label={badge ?? lead}
            count={count}
          />
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          {description ? <p className="admin-domain-detail">{description}</p> : <span className="admin-domain-detail" />}
          <span className="admin-domain-cta">{primaryLabel ?? "Open workspace"}</span>
        </div>
      </Link>
    </motion.div>
  );
}

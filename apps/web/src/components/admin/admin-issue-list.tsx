"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { AdminStatusChip } from "./admin-status-chip";
import type { AdminIssueItem } from "./admin-types";

export function AdminIssueList({
  title,
  description,
  items,
}: {
  title: string;
  description?: string;
  items: AdminIssueItem[];
}) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="admin-surface">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-[-0.03em] text-foreground">{title}</h2>
        {description ? <p className="text-sm leading-7 text-foreground/60">{description}</p> : null}
      </div>
      <div className="admin-issue-strip">
        {items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: reduceMotion ? 0 : index * 0.04, ease: "easeOut" }}
            className="admin-issue-strip-item"
          >
            <Link href={item.href} className="admin-issue-link">
              <AdminStatusChip tone={item.statusTone} icon={item.statusIcon} label={item.label} count={item.count} />
              <span className="admin-issue-link-arrow" aria-hidden="true">
                Open
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

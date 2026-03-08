"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import type { AdminCardMetric } from "./admin-types";
import { cn } from "@/lib/utils";

export function AdminDomainCard({
  href,
  title,
  description,
  eyebrow,
  badge,
  metrics,
  issue,
  primaryLabel,
}: {
  href: string;
  title: string;
  description: string;
  eyebrow?: string;
  badge?: string | null;
  metrics?: AdminCardMetric[];
  issue?: string | null;
  primaryLabel?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
    >
      <Link href={href} className="admin-domain-card">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            {eyebrow ? <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-foreground/45">{eyebrow}</div> : null}
            <div>
              <div className="text-xl font-semibold tracking-[-0.03em]">{title}</div>
              <p className="mt-2 text-sm leading-6 text-foreground/62">{description}</p>
            </div>
          </div>
          {badge ? <span className="admin-domain-badge">{badge}</span> : null}
        </div>

        {metrics?.length ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {metrics.map((metric) => (
              <div key={`${title}:${metric.label}`} className="admin-domain-metric">
                <div className="text-[0.72rem] uppercase tracking-[0.16em] text-foreground/46">{metric.label}</div>
                <div
                  className={cn(
                    "mt-2 text-2xl font-semibold tracking-[-0.04em]",
                    metric.tone === "positive" && "text-emerald-700 dark:text-emerald-300",
                    metric.tone === "warning" && "text-amber-700 dark:text-amber-300",
                  )}
                >
                  {metric.value}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-foreground/58">{issue ?? "No urgent blockers in this area."}</div>
          <span className="admin-domain-cta">{primaryLabel ?? "Open workspace"}</span>
        </div>
      </Link>
    </motion.div>
  );
}

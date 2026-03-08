"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import type { AdminNavItem } from "./admin-types";
import { cn } from "@/lib/utils";

export function AdminAppShell({
  navItems,
  tierLabel,
  children,
}: {
  navItems: AdminNavItem[];
  tierLabel: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div className="admin-shell-frame">
      <div className="admin-shell-backdrop" aria-hidden="true" />
      <motion.div
        className="admin-shell-nav"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="admin-shell-kicker">Admin</div>
          <div className="text-sm text-foreground/60">{tierLabel}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname === item.href || pathname.startsWith(`${item.href}/`) || pathname.startsWith(`${item.href}#`);

            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn("admin-shell-link", active && "admin-shell-link-active")}
                aria-current={active ? "page" : undefined}
              >
                <span>{item.label}</span>
                {item.badge ? <span className="admin-domain-badge">{item.badge}</span> : null}
              </Link>
            );
          })}
        </div>
      </motion.div>

      <motion.div
        key={pathname}
        className="admin-canvas"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

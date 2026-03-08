"use client";

import Link from "next/link";

import type { AdminDomainId, AdminDomainMeta } from "./admin-types";
import { cn } from "@/lib/utils";

export function AdminDomainSwitch({
  domains,
  activeDomain,
  onSelect,
}: {
  domains: AdminDomainMeta[];
  activeDomain: AdminDomainId;
  onSelect?: (id: AdminDomainId) => void;
}) {
  return (
    <div className="admin-domain-switch">
      {domains.map((domain) => {
        const active = domain.id === activeDomain;
        const className = cn("admin-domain-pill", active && "admin-domain-pill-active", domain.disabled && "opacity-50");

        const content = (
          <>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span>{domain.label}</span>
                {domain.badge ? <span className="admin-domain-badge">{domain.badge}</span> : null}
              </div>
              <div className="mt-1 line-clamp-2 text-[0.73rem] font-normal text-foreground/58">{domain.description}</div>
            </div>
          </>
        );

        if (domain.href) {
          return (
            <Link key={domain.id} href={domain.href} className={className} aria-current={active ? "page" : undefined}>
              {content}
            </Link>
          );
        }

        return (
          <button
            key={domain.id}
            type="button"
            className={className}
            aria-pressed={active}
            disabled={domain.disabled}
            onClick={() => onSelect?.(domain.id)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

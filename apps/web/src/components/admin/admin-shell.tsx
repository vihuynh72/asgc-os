import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AdminShell({
  eyebrow = "Admin",
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("admin-page", className)}>
      <div className="admin-hero">
        <div className="space-y-3">
          <div className="admin-eyebrow">{eyebrow}</div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-4xl">{title}</h1>
            <p className="max-w-3xl text-sm leading-6 text-foreground/68 sm:text-[0.95rem]">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

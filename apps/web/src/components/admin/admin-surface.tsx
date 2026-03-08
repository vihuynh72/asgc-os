import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AdminSurface({
  as: Comp = "section",
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  as?: ElementType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Comp className={cn("admin-surface", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
          {description ? <p className="text-sm leading-6 text-foreground/65">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {children ? <div className={cn("mt-5", contentClassName)}>{children}</div> : null}
    </Comp>
  );
}

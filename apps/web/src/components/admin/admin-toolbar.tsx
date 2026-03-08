import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AdminToolbar({
  primary,
  secondary,
  children,
  className,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("admin-toolbar", className)}>
      <div className="flex flex-1 flex-wrap items-center gap-2">{primary}</div>
      {children ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div> : null}
      {secondary ? <div className="flex flex-wrap items-center justify-end gap-2">{secondary}</div> : null}
    </div>
  );
}

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AdminField({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("admin-field", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground/78">{label}</span>
        {hint ? <span className="text-xs text-foreground/52">{hint}</span> : null}
      </div>
      <div className="mt-2">{children}</div>
    </label>
  );
}

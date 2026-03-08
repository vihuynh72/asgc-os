import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AdminDataList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("admin-data-list", className)}>{children}</div>;
}

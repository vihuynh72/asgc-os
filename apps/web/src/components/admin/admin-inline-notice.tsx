import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AdminInlineNotice({
  tone = "default",
  children,
}: {
  tone?: "default" | "warning" | "positive";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "admin-inline-notice",
        tone === "warning" && "admin-inline-notice-warning",
        tone === "positive" && "admin-inline-notice-positive",
      )}
    >
      {children}
    </div>
  );
}

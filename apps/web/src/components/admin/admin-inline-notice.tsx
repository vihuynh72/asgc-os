import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { AdminStatusIcon } from "./admin-status-icon";
import type { AdminStatusTone } from "./admin-types";

export function AdminInlineNotice({
  tone = "default",
  children,
}: {
  tone?: "default" | "warning" | "positive" | "critical" | "neutral" | "good";
  children: ReactNode;
}) {
  const normalizedTone: AdminStatusTone =
    tone === "positive" ? "good" : tone === "default" ? "neutral" : (tone as AdminStatusTone);
  const iconName = normalizedTone === "critical" ? "triangle" : normalizedTone === "warning" ? "clock" : normalizedTone === "good" ? "check" : "dot";

  return (
    <div
      className={cn(
        "admin-inline-notice",
        normalizedTone === "critical" && "admin-inline-notice-critical",
        normalizedTone === "warning" && "admin-inline-notice-warning",
        normalizedTone === "good" && "admin-inline-notice-good",
        normalizedTone === "neutral" && "admin-inline-notice-neutral",
      )}
    >
      <AdminStatusIcon name={iconName} className="mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

import { cn } from "@/lib/utils";

import { AdminStatusIcon } from "./admin-status-icon";
import type { AdminStatusIconName, AdminStatusTone } from "./admin-types";

function defaultIconForTone(tone: AdminStatusTone): AdminStatusIconName {
  if (tone === "critical") return "triangle";
  if (tone === "warning") return "clock";
  if (tone === "good") return "check";
  return "dot";
}

export function AdminStatusChip({
  tone = "neutral",
  icon,
  label,
  count,
  className,
}: {
  tone?: AdminStatusTone;
  icon?: AdminStatusIconName;
  label: string;
  count?: number | null;
  className?: string;
}) {
  const hasCount = typeof count === "number" && Number.isFinite(count) && count >= 0;
  const iconName = icon ?? defaultIconForTone(tone);

  return (
    <span
      className={cn(
        "admin-status-chip",
        tone === "critical" && "admin-status-chip-critical",
        tone === "warning" && "admin-status-chip-warning",
        tone === "good" && "admin-status-chip-good",
        tone === "neutral" && "admin-status-chip-neutral",
        className,
      )}
    >
      <AdminStatusIcon name={iconName} />
      <span className="truncate">{label}</span>
      {hasCount ? <span className="admin-status-chip-count">{count}</span> : null}
    </span>
  );
}

import { AdminStatusChip } from "@/components/admin/admin-status-chip";
import type { AdminStatusIconName, AdminStatusTone } from "@/components/admin/admin-types";
import { cn } from "@/lib/utils";

export function KioskStatusChip({
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
  return (
    <AdminStatusChip
      tone={tone}
      icon={icon}
      label={label}
      count={count}
      className={cn("kiosk-status-chip", className)}
    />
  );
}

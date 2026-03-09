import type { ReactNode } from "react";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import type { AdminStatusTone } from "@/components/admin/admin-types";
import { cn } from "@/lib/utils";

export function KioskNotice({
  tone = "neutral",
  children,
  className,
}: {
  tone?: AdminStatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AdminInlineNotice tone={tone}>
      <span className={cn("kiosk-notice-copy", className)}>{children}</span>
    </AdminInlineNotice>
  );
}

import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

import type { AdminStatusIconName } from "./admin-types";

const ICON_PATHS: Record<AdminStatusIconName, ReactElement> = {
  triangle: (
    <path
      d="M6.5 3.4a1.7 1.7 0 0 1 3 0l5.44 9.44A1.7 1.7 0 0 1 13.44 15H2.56a1.7 1.7 0 0 1-1.5-2.16L6.5 3.4Z"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.3"
    />
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 5.3v3.1l2.2 1.3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
    </>
  ),
  check: <path d="M3.2 8.2 6.7 11.5 12.8 4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />,
  dot: <circle cx="8" cy="8" r="2.4" fill="currentColor" />,
};

export function AdminStatusIcon({
  name,
  className,
}: {
  name: AdminStatusIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("h-3.5 w-3.5 shrink-0", className)}
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

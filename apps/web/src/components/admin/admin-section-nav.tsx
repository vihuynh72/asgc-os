import Link from "next/link";

import type { AdminSectionNavItem } from "./admin-types";
import { cn } from "@/lib/utils";

export function AdminSectionNav({
  items,
  activeId,
}: {
  items: AdminSectionNavItem[];
  activeId: string;
}) {
  return (
    <nav className="admin-section-nav" aria-label="Admin section navigation">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={cn("admin-section-link", item.id === activeId && "admin-section-link-active")}
          aria-current={item.id === activeId ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

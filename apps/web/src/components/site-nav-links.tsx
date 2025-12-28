"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };
type NavGroup = { label: string; items: NavItem[] };

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNavLinks({
  groups,
  links,
}: {
  groups?: NavGroup[];
  links?: NavItem[];
}) {
  const pathname = usePathname() ?? "/";

  if (groups && groups.length > 0) {
    const activeGroup =
      groups.find((group) => group.items.some((item) => isActive(pathname, item.href))) ?? groups[0];
    return (
      <nav aria-label="Primary" className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {groups.map((group) => {
            const isGroupActive = group.label === activeGroup.label;
            const href = group.items[0]?.href ?? "/";
            return (
              <Link
                key={group.label}
                href={href}
                className={`rounded-full border px-2 py-1 transition-colors ${
                  isGroupActive
                    ? "border-foreground/30 bg-foreground/10 text-foreground"
                    : "border-foreground/10 text-foreground/70 hover:text-foreground"
                }`}
                aria-current={isGroupActive ? "page" : undefined}
              >
                {group.label}
              </Link>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto whitespace-nowrap text-sm">
          {activeGroup.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`transition-colors ${
                  active ? "font-semibold text-foreground underline underline-offset-4" : "text-foreground/80 hover:text-foreground"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className="flex min-w-0 flex-1 gap-4 overflow-x-auto whitespace-nowrap text-sm">
      {(links ?? []).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`transition-colors ${
              active ? "font-semibold text-foreground underline underline-offset-4" : "text-foreground/80 hover:text-foreground"
            }`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

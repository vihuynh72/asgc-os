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
    return (
      <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto whitespace-nowrap text-sm">
        {groups.map((group, index) => (
          <div key={group.label} className="flex items-center gap-3">
            <div role="group" aria-label={group.label} className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-foreground/40">
                {group.label}
              </span>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`transition-colors ${active ? "font-semibold text-foreground underline underline-offset-4" : "text-foreground/80 hover:text-foreground"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            {index < groups.length - 1 ? (
              <span className="h-4 w-px bg-foreground/10" aria-hidden="true" />
            ) : null}
          </div>
        ))}
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
            className={`transition-colors ${active ? "font-semibold text-foreground underline underline-offset-4" : "text-foreground/80 hover:text-foreground"}`}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

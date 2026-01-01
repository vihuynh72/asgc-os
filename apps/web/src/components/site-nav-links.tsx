"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconChevronDown } from "@/components/ui/icons";

type NavItem = { href: string; label: string };
type NavSection = { label: string; items: NavItem[] };

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNavLinks({
  primary,
  sections,
}: {
  primary?: NavItem[];
  sections?: NavSection[];
}) {
  const pathname = usePathname() ?? "/";
  const primaryLinks = primary ?? [];
  const navSections = sections ?? [];
  const hasSections = navSections.length > 0;

  return (
    <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto whitespace-nowrap text-sm">
        {primaryLinks.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                active
                  ? "border border-primary/30 bg-primary/15 font-semibold text-foreground underline underline-offset-4"
                  : "border border-transparent text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {hasSections ? (
        <div className="flex items-center gap-2">
          {navSections.map((section) => {
            const sectionActive = section.items.some((item) => isActive(pathname, item.href));
            return (
              <Popover key={section.label}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                      sectionActive
                        ? "border border-primary/30 bg-primary/10 font-semibold text-foreground"
                        : "border border-transparent text-foreground/70 hover:bg-muted/60 hover:text-foreground"
                    }`}
                    aria-haspopup="menu"
                  >
                    <span className="inline-flex items-center gap-1">
                      {section.label}
                      <IconChevronDown className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-3">
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center rounded-md px-2 py-1 text-sm transition-colors ${
                            active
                              ? "bg-muted/60 font-medium text-foreground"
                              : "text-foreground/70 hover:bg-muted/60 hover:text-foreground"
                          }`}
                          aria-current={active ? "page" : undefined}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}

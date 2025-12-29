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
  const activeSection =
    navSections.find((section) => section.items.some((item) => isActive(pathname, item.href))) ?? null;
  const hasSections = navSections.length > 0;

  return (
    <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto whitespace-nowrap text-sm">
        {primaryLinks.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-sm px-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                active ? "font-semibold text-foreground" : "text-foreground/70 hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {hasSections ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                activeSection
                  ? "bg-muted/60 text-foreground"
                  : "text-foreground/70 hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                {activeSection?.label ?? "More"}
                <IconChevronDown className="h-3.5 w-3.5" />
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-3">
            <div className="space-y-3">
              {navSections.map((section) => (
                <div key={section.label} className="space-y-1">
                  <div className="px-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground/50">
                    {section.label}
                  </div>
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
              ))}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
    </nav>
  );
}

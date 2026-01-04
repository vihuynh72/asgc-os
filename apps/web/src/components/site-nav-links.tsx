"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconChevronDown, IconMenu, IconX } from "@/components/ui/icons";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav aria-label="Primary" className="flex min-w-0 flex-1 items-center gap-4">
      <div className="hidden min-w-0 flex-1 items-center gap-4 overflow-x-auto whitespace-nowrap text-sm md:flex">
        {primaryLinks.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                active
                  ? "border border-primary/40 bg-primary/20 font-semibold text-foreground underline decoration-2 decoration-primary/70 underline-offset-4 ring-1 ring-primary/30"
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
        <div className="hidden items-center gap-2 md:flex">
          {navSections.map((section) => {
            const sectionActive = section.items.some((item) => isActive(pathname, item.href));
            return (
              <Popover key={section.label}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                      sectionActive
                        ? "border border-primary/40 bg-primary/20 font-semibold text-foreground ring-1 ring-primary/30"
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

      <div className="flex items-center md:hidden">
        <Popover open={mobileOpen} onOpenChange={setMobileOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
              title={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {mobileOpen ? <IconX className="h-4 w-4" /> : <IconMenu className="h-4 w-4" />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <div className="grid gap-1">
              {primaryLinks.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary/20 font-semibold text-foreground"
                        : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {navSections.map((section) => (
              <div key={section.label} className="mt-2 border-t border-foreground/10 pt-2">
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground/50">
                  {section.label}
                </div>
                <div className="grid gap-1">
                  {section.items.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                          active
                            ? "bg-primary/20 font-semibold text-foreground"
                            : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground"
                        }`}
                        aria-current={active ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}

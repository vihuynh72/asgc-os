"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconChevronDown, IconMenu, IconX } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { getActiveNavKey } from "@/lib/nav-indicator.mjs";

type NavItem = { href: string; label: string };
type NavSection = { label: string; items: NavItem[] };

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function desktopLinkClassName(active: boolean): string {
  return `relative z-10 rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
    active ? "font-semibold text-foreground" : "text-foreground/70 hover:bg-muted/60 hover:text-foreground"
  }`;
}

function menuItemClassName(active: boolean): string {
  return `flex items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
    active ? "bg-muted/70 font-medium text-foreground" : "text-foreground/80 hover:bg-muted/70 hover:text-foreground"
  }`;
}

export function SiteNavLinks({
  primary,
  sections,
  className,
}: {
  primary?: NavItem[];
  sections?: NavSection[];
  className?: string;
}) {
  const pathname = usePathname() ?? "/";
  const primaryLinks = primary ?? [];
  const navSections = sections ?? [];
  const hasSections = navSections.length > 0;
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreActive = navSections.some((section) => section.items.some((item) => isActive(pathname, item.href)));
  const desktopNavRef = useRef<HTMLDivElement | null>(null);
  const activeKey = getActiveNavKey(pathname, primaryLinks.map((item) => item.href), moreActive);
  const [indicator, setIndicator] = useState<{ x: number; width: number } | null>(null);
  const indicatorVisible = !!(activeKey && indicator);

  useEffect(() => {
    const container = desktopNavRef.current;
    if (!container || !activeKey) return;

    let rafId = 0;
    const measure = () => {
      const node = desktopNavRef.current;
      if (!node) return;

      const target = node.querySelector<HTMLElement>(`[data-nav-key="${activeKey}"]`);
      if (!target) {
        setIndicator(null);
        return;
      }

      const containerRect = node.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const x = Math.round(rect.left - containerRect.left);
      const width = Math.round(rect.width);

      setIndicator((prev) => {
        if (prev && prev.x === x && prev.width === width) return prev;
        return { x, width };
      });
    };

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    schedule();

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(container);
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [activeKey]);

  return (
    <nav aria-label="Primary" className={cn("flex items-center gap-4", className)}>
      <div ref={desktopNavRef} className="relative hidden items-center gap-1 whitespace-nowrap md:flex">
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-0 rounded-full bg-muted/70 shadow-sm ring-1 ring-border/60",
            "transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
            indicatorVisible ? "opacity-100" : "opacity-0",
          )}
          style={
            indicatorVisible && indicator
              ? { width: indicator.width, transform: `translateX(${indicator.x}px)` }
              : { width: 0 }
          }
        />
        {primaryLinks.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-nav-key={item.href}
              className={desktopLinkClassName(active)}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}

        {hasSections ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-nav-key="more"
                className={desktopLinkClassName(moreActive)}
                aria-haspopup="menu"
              >
                <span className="inline-flex items-center gap-1.5">
                  More
                  <IconChevronDown className="h-3.5 w-3.5" />
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              {navSections.map((section) => (
                <div key={section.label} className="py-1">
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
                          className={menuItemClassName(active)}
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
        ) : null}
      </div>

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
                    className={menuItemClassName(active)}
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
                        className={menuItemClassName(active)}
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

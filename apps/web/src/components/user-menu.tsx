"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function initialsFromIdentifier(identifier: string): string {
  const cleaned = identifier
    .trim()
    .replace(/@.*$/, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();

  if (!cleaned) return "U";

  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "U";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : cleaned[1] ?? "";
  return `${first}${second}`.toUpperCase();
}

export function UserMenu({
  userEmail,
  userId,
  className,
}: {
  userEmail: string | null;
  userId: string;
  className?: string;
}) {
  const initials = useMemo(() => initialsFromIdentifier(userEmail ?? userId), [userEmail, userId]);

  const menuItemClassName = cn(
    "flex w-full items-center rounded-lg px-3 py-2 text-sm text-foreground/80 transition-colors",
    "hover:bg-muted/70 hover:text-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full bg-muted/80 text-xs font-semibold text-foreground/80 shadow-sm ring-1 ring-border/60",
            "transition-colors hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            className
          )}
          aria-label="Open user menu"
        >
          {initials}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-2">
        <div className="grid gap-1">
          <Link href="/account" className={menuItemClassName}>
            Account
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className={menuItemClassName}>
              Sign out
            </button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}


"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/lib/utils";

export function AdminDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-white/55 bg-[color:var(--admin-surface-raised)] p-5 text-foreground shadow-2xl shadow-black/12 outline-none backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:p-6",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-black/6 pb-4 dark:border-white/8">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-[-0.02em]">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm leading-6 text-foreground/65">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/6 bg-white/72 text-sm text-foreground/70 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
              Close
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

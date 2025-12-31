"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        duration: 6000,
        classNames: {
          toast: "bg-background text-foreground border shadow-lg",
          title: "text-foreground font-medium",
          description: "text-foreground/70",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-muted text-muted-foreground",
          success: "border-green-500/50 bg-green-50 dark:bg-green-950/30",
          error: "border-red-500/50 bg-red-50 dark:bg-red-950/30",
          warning: "border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/30",
          info: "border-blue-500/50 bg-blue-50 dark:bg-blue-950/30",
        },
      }}
    />
  );
}

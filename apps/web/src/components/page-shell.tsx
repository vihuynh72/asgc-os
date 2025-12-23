import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageShell({
  title,
  description,
  children,
  containerClassName,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  containerClassName?: string;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn("mx-auto w-full px-4 py-8", containerClassName ?? "max-w-5xl")}
    >
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-foreground/70">{description}</p>
        ) : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </main>
  );
}

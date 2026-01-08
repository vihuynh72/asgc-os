import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function PageShell({
  title,
  description,
  children,
  containerClassName,
  descriptionClassName,
  backHref,
  backLabel,
  showHeader = true,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  containerClassName?: string;
  descriptionClassName?: string;
  backHref?: string;
  backLabel?: string;
  showHeader?: boolean;
}) {
  return (
    <section className={cn("mx-auto w-full px-4 py-8", containerClassName ?? "max-w-5xl")}>
      {showHeader ? (
        <div className="space-y-2">
          {backHref ? (
            <Link href={backHref} className="text-sm text-foreground/70 hover:text-foreground">
              {backLabel ?? "Back"}
            </Link>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className={cn("text-sm text-foreground/70", descriptionClassName)}>{description}</p>
          ) : null}
        </div>
      ) : (
        <h1 className="sr-only">{title}</h1>
      )}
      {children ? <div className={showHeader ? "mt-6" : undefined}>{children}</div> : null}
    </section>
  );
}

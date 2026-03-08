import type { ReactNode } from "react";

export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty-state">
      <div className="max-w-md space-y-2">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
        <p className="text-sm leading-6 text-foreground/65">{description}</p>
      </div>
      {action ? <div className="mt-4 flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}

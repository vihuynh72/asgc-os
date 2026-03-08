import type { AdminStat } from "./admin-types";

import { cn } from "@/lib/utils";

export function AdminStatStrip({ stats }: { stats: AdminStat[] }) {
  if (stats.length === 0) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.id} className="admin-stat-card">
          <div className="text-[0.72rem] uppercase tracking-[0.16em] text-foreground/50">{stat.label}</div>
          <div
            className={cn(
              "mt-3 text-2xl font-semibold tracking-[-0.03em]",
              stat.tone === "warning" && "text-amber-700 dark:text-amber-300",
              stat.tone === "positive" && "text-emerald-700 dark:text-emerald-300",
            )}
          >
            {stat.value}
          </div>
          {stat.detail ? <div className="mt-2 text-sm leading-6 text-foreground/62">{stat.detail}</div> : null}
        </div>
      ))}
    </div>
  );
}

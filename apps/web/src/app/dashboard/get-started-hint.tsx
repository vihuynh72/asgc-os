"use client";

import { useEffect, useState } from "react";

import { ButtonLink } from "@/components/ui/button-link";
import { Button } from "@/components/ui/button";
import { DASHBOARD_GET_STARTED_STORAGE_KEY, shouldShowDashboardGetStarted } from "@/lib/dashboard-get-started.mjs";

export function DashboardGetStartedHint({
  totalMinutes,
  hasOpenSession,
}: {
  totalMinutes: number;
  hasOpenSession: boolean;
}) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DASHBOARD_GET_STARTED_STORAGE_KEY) === "1");
  }, []);

  if (dismissed === null) return null;
  if (hasOpenSession) return null;

  if (!shouldShowDashboardGetStarted({ totalMinutes, dismissed })) return null;

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/50 px-4 py-3 ring-1 ring-border/60">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">Get started</div>
        <div className="mt-0.5 text-xs text-foreground/70">Log your first office hours to start tracking this week.</div>
      </div>
      <div className="flex items-center gap-2">
        <ButtonLink href="/office-hours" size="sm">
          Log hours
        </ButtonLink>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            window.localStorage.setItem(DASHBOARD_GET_STARTED_STORAGE_KEY, "1");
            setDismissed(true);
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}


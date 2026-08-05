"use client";

import { useSyncExternalStore } from "react";

import { ButtonLink } from "@/components/ui/button-link";
import { Button } from "@/components/ui/button";
import { DASHBOARD_GET_STARTED_STORAGE_KEY, shouldShowDashboardGetStarted } from "@/lib/dashboard-get-started.mjs";

const DASHBOARD_GET_STARTED_DISMISSED_EVENT = "asgc:dashboard-get-started-dismissed";

function subscribeToDismissedState(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === DASHBOARD_GET_STARTED_STORAGE_KEY) onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(DASHBOARD_GET_STARTED_DISMISSED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(DASHBOARD_GET_STARTED_DISMISSED_EVENT, onStoreChange);
  };
}

function getDismissedSnapshot() {
  return window.localStorage.getItem(DASHBOARD_GET_STARTED_STORAGE_KEY) === "1";
}

function getDismissedServerSnapshot() {
  return true;
}

export function DashboardGetStartedHint({
  totalMinutes,
  hasOpenSession,
}: {
  totalMinutes: number;
  hasOpenSession: boolean;
}) {
  const dismissed = useSyncExternalStore(
    subscribeToDismissedState,
    getDismissedSnapshot,
    getDismissedServerSnapshot,
  );

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
            window.dispatchEvent(new Event(DASHBOARD_GET_STARTED_DISMISSED_EVENT));
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

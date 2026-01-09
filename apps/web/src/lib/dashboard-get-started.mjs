export const DASHBOARD_GET_STARTED_STORAGE_KEY = "asgc_dashboard_get_started_dismissed";

export function shouldShowDashboardGetStarted({ totalMinutes, dismissed }) {
  const safeMinutes = Number.isFinite(totalMinutes) ? totalMinutes : 0;
  return safeMinutes <= 0 && !dismissed;
}


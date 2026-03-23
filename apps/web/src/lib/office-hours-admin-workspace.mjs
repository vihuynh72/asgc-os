import {
  completionPercent,
  reportStatus,
  sortWeeklyReportRows,
} from "./office-hours-weekly-report.mjs";

/**
 * @typedef {{
 *   required_hours?: number | string;
 *   total_hours?: number | string;
 *   missing_hours?: number | string;
 *   needs_review_sessions?: number | string;
 *   member_status?: "assigned" | "vacant" | "no_show";
 *   [key: string]: unknown;
 * }} OverviewWeekRow
 */

/**
 * @typedef {{
 *   status?: string;
 *   checkout_at?: string | null;
 *   duration_minutes?: number | string | null;
 *   admin_closed_by?: string | null;
 *   [key: string]: unknown;
 * }} OverviewSessionRow
 */

/**
 * @typedef {{
 *   status?: string;
 *   covered_by_user_id?: string | null;
 *   open_coverage_request_count?: number | string;
 *   claimed_coverage_request_count?: number | string;
 *   [key: string]: unknown;
 * }} OverviewShiftRow
 */

function toFiniteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }
  return 0;
}

function roundPercent(unit) {
  return `${Math.round(Math.max(0, Math.min(1, unit)) * 100)}%`;
}

export function getOfficeHourShiftActionState(shift, nowIso = new Date().toISOString()) {
  const startsAt = Date.parse(shift?.starts_at ?? "");
  const now = Date.parse(nowIso);
  const isFuture = !Number.isNaN(startsAt) && !Number.isNaN(now) && startsAt > now;
  const isScheduled = (shift?.status ?? "") === "scheduled";

  return {
    canEdit: isScheduled && isFuture,
    canCancel: isScheduled && isFuture,
  };
}

/**
 * @param {{ weekRows?: OverviewWeekRow[]; sessions?: OverviewSessionRow[]; shifts?: OverviewShiftRow[] }} params
 */
export function buildOfficeHoursOverviewModel({ weekRows = [], sessions = [], shifts = [] }) {
  const performanceRows = sortWeeklyReportRows(
    weekRows.map((row) => {
      const statusKey = reportStatus({
        required_hours: row.required_hours,
        total_hours: row.total_hours,
        missing_hours: row.missing_hours,
      });
      const completion = completionPercent({
        required_hours: row.required_hours,
        total_hours: row.total_hours,
      });

      return {
        ...row,
        statusKey,
        completion,
      };
    }),
  );

  const totals = performanceRows.reduce(
    (acc, row) => {
      acc.requiredHours += toFiniteNumber(row.required_hours);
      acc.completedHours += toFiniteNumber(row.total_hours);
      acc.reviewSessions += toFiniteNumber(row.needs_review_sessions);
      if ((row.statusKey === "behind" || row.statusKey === "missing") && row.member_status !== "vacant") {
        acc.behindMembers += 1;
      }
      return acc;
    },
    {
      requiredHours: 0,
      completedHours: 0,
      reviewSessions: 0,
      behindMembers: 0,
    },
  );

  const openSessions = sessions.filter((session) => session?.status === "open" && !session?.checkout_at);
  const recentExceptions = sessions.filter((session) => session?.status === "auto_closed" || session?.admin_closed_by);
  const trackedMinutes = sessions.reduce((sum, session) => sum + toFiniteNumber(session?.duration_minutes), 0);
  const schedulePulse = shifts.reduce(
    (acc, shift) => {
      if (shift?.status === "scheduled") acc.scheduledCount += 1;
      if (shift?.status === "cancelled") acc.cancelledCount += 1;
      const openCoverage = toFiniteNumber(shift?.open_coverage_request_count);
      const claimedCoverage = toFiniteNumber(shift?.claimed_coverage_request_count);
      if (shift?.covered_by_user_id || claimedCoverage > 0) acc.coveredCount += 1;
      acc.openCoverageRequests += openCoverage;
      return acc;
    },
    {
      scheduledCount: 0,
      cancelledCount: 0,
      coveredCount: 0,
      openCoverageRequests: 0,
    },
  );

  const aggregateCompletion =
    totals.requiredHours > 0 ? Math.max(0, Math.min(1, totals.completedHours / totals.requiredHours)) : 1;
  const attentionItems = totals.reviewSessions + openSessions.length + schedulePulse.openCoverageRequests;

  return {
    stats: {
      completionRateLabel: roundPercent(aggregateCompletion),
      membersBehind: totals.behindMembers,
      openSessions: openSessions.length,
      trackedMinutes,
      attentionItems,
    },
    performanceRows,
    liveOperations: {
      openSessions,
      recentExceptions,
    },
    schedulePulse,
  };
}

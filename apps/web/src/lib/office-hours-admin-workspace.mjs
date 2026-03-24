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

function parseDateOnly(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysDateOnly(value, days) {
  const date = parseDateOnly(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

function startOfWeekMondayDateOnly(value) {
  const date = parseDateOnly(value);
  if (!date) return null;
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return formatDateOnly(date);
}

function todayDateString() {
  return formatDateOnly(new Date());
}

function buildPerformanceRows(weekRows) {
  return sortWeeklyReportRows(
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
}

function formatDateKeyInTimezone(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function compareIso(a, b) {
  return Date.parse(a) - Date.parse(b);
}

function buildShiftCoverageState(shift) {
  if ((shift?.status ?? "") === "cancelled") return "cancelled";
  if (shift?.covered_by_user_id || toFiniteNumber(shift?.claimed_coverage_request_count) > 0) return "covered";
  if (toFiniteNumber(shift?.open_coverage_request_count) > 0) return "coverage_requested";
  return null;
}

function buildSessionBucketsByUserDate(sessions) {
  const map = new Map();
  for (const session of sessions) {
    const dateKey = formatDateKeyInTimezone(
      session?.checkin_at ?? "",
      session?.office_location_timezone ?? null,
    );
    if (!dateKey || !session?.user_id) continue;
    const key = `${session.user_id}:${dateKey}`;
    const collection = map.get(key) ?? [];
    collection.push(session);
    map.set(key, collection);
  }
  for (const collection of map.values()) {
    collection.sort((a, b) => compareIso(a.checkin_at, b.checkin_at));
  }
  return map;
}

function resolveShiftSessionState({ shift, todayDate, nowIso, sessionsByUserDate }) {
  const shiftDate = formatDateKeyInTimezone(shift?.starts_at ?? "", shift?.office_location_timezone ?? null);
  if (!shiftDate || shiftDate !== todayDate || shift?.status === "cancelled") return null;

  const relatedSessions = sessionsByUserDate.get(`${shift.user_id}:${shiftDate}`) ?? [];
  if (relatedSessions.some((session) => session?.status === "open" && !session?.checkout_at)) {
    return "checked_in_now";
  }
  if (relatedSessions.some((session) => session?.status !== "open" && session?.checkout_at)) {
    return "completed_today";
  }

  const startsAt = Date.parse(shift?.starts_at ?? "");
  const now = Date.parse(nowIso);
  if (!Number.isNaN(startsAt) && !Number.isNaN(now) && startsAt <= now) {
    return "no_session_yet";
  }
  return null;
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
  const performanceRows = buildPerformanceRows(weekRows);

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

/**
 * @param {{
 *   weekStart?: string | null;
 *   todayDate?: string | null;
 *   nowIso?: string | null;
 *   weekRows?: OverviewWeekRow[];
 *   sessions?: Array<OverviewSessionRow & { id?: string; user_id?: string; checkin_at?: string; office_location_timezone?: string | null }>;
 *   shifts?: Array<OverviewShiftRow & {
 *     id?: string;
 *     user_id?: string;
 *     starts_at?: string;
 *     ends_at?: string;
 *     office_location_timezone?: string | null;
 *     user_display_name?: string;
 *     user_email?: string;
 *   }>;
 * }} params
 */
export function buildOfficeHoursScheduleWorkspaceModel({
  weekStart,
  todayDate,
  nowIso = new Date().toISOString(),
  weekRows = [],
  sessions = [],
  shifts = [],
}) {
  const resolvedWeekStart = startOfWeekMondayDateOnly(weekStart ?? todayDate ?? todayDateString()) ?? todayDateString();
  const resolvedToday = todayDate ?? todayDateString();
  const performanceRows = buildPerformanceRows(weekRows);
  const performanceByUserId = new Map(performanceRows.map((row) => [row.user_id, row]));
  const sessionsByUserDate = buildSessionBucketsByUserDate(sessions);

  const dayKeys = Array.from({ length: 5 }, (_, index) => addDaysDateOnly(resolvedWeekStart, index) ?? resolvedWeekStart);
  const dayMap = new Map(dayKeys.map((day) => [day, []]));

  for (const shift of shifts) {
    const dateKey = formatDateKeyInTimezone(shift?.starts_at ?? "", shift?.office_location_timezone ?? null);
    if (!dayMap.has(dateKey)) continue;
    const sessionState = resolveShiftSessionState({
      shift,
      todayDate: resolvedToday,
      nowIso,
      sessionsByUserDate,
    });

    dayMap.get(dateKey)?.push({
      ...shift,
      coverageState: buildShiftCoverageState(shift),
      sessionState,
      dateKey,
      actionState: getOfficeHourShiftActionState(shift, nowIso),
    });
  }

  const days = dayKeys.map((day) => {
    const dayShifts = (dayMap.get(day) ?? []).sort((a, b) => compareIso(a.starts_at, b.starts_at));
    return {
      date: day,
      isToday: day === resolvedToday,
      shifts: dayShifts,
      openSessionCount: dayShifts.filter((shift) => shift.sessionState === "checked_in_now").length,
    };
  });

  const todayColumn = days.find((day) => day.isToday) ?? { date: resolvedToday, isToday: true, shifts: [], openSessionCount: 0 };
  const todayOpenSessions = (sessions ?? [])
    .filter((session) => formatDateKeyInTimezone(session?.checkin_at ?? "", session?.office_location_timezone ?? null) === resolvedToday)
    .filter((session) => session?.status === "open" && !session?.checkout_at)
    .sort((a, b) => compareIso(a.checkin_at, b.checkin_at));
  const now = Date.parse(nowIso);
  const upcomingShifts = todayColumn.shifts.filter((shift) => {
    const startsAt = Date.parse(shift?.starts_at ?? "");
    return !Number.isNaN(startsAt) && !Number.isNaN(now) && startsAt > now && shift.status === "scheduled";
  });

  const blockerKeys = new Set();
  const blockers = [];
  for (const shift of todayColumn.shifts) {
    const coverageRequests = toFiniteNumber(shift?.open_coverage_request_count);
    if (coverageRequests > 0) {
      const key = `coverage:${shift.id}`;
      if (!blockerKeys.has(key)) {
        blockerKeys.add(key);
        blockers.push({
          kind: "coverage_request",
          shiftId: shift.id ?? "",
          userId: shift.user_id ?? "",
          label: `${shift.user_display_name || shift.user_email || "Member"} needs coverage`,
        });
      }
    }

    const reviewCount = toFiniteNumber(performanceByUserId.get(shift.user_id)?.needs_review_sessions);
    if (reviewCount > 0) {
      const key = `review:${shift.user_id}`;
      if (!blockerKeys.has(key)) {
        blockerKeys.add(key);
        blockers.push({
          kind: "review_flag",
          shiftId: shift.id ?? "",
          userId: shift.user_id ?? "",
          label: `${shift.user_display_name || shift.user_email || "Member"} has ${reviewCount} review flag${reviewCount === 1 ? "" : "s"}`,
        });
      }
    }

    if (shift.sessionState === "no_session_yet" && coverageRequests === 0) {
      const key = `missing:${shift.id}`;
      if (!blockerKeys.has(key)) {
        blockerKeys.add(key);
        blockers.push({
          kind: "missed_expected_activity",
          shiftId: shift.id ?? "",
          userId: shift.user_id ?? "",
          label: `${shift.user_display_name || shift.user_email || "Member"} has not started today's shift`,
        });
      }
    }
  }

  return {
    weekStart: resolvedWeekStart,
    days,
    today: {
      date: resolvedToday,
      shifts: todayColumn.shifts,
      openSessions: todayOpenSessions,
      upcomingShifts,
      blockers,
    },
    performanceRows,
  };
}

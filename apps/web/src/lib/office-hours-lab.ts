import { getMemberKioskFlowModel } from "./office-hours-member-kiosk.mjs";
import { shapeLocationCheckResult } from "./office-hours-kiosk/location-check.mjs";
import { mapDistanceToPreflightStatus } from "./office-hours-kiosk/entry-state.mjs";
import { getOfficeHoursPresencePolicy } from "./office-hours-presence-lifecycle.mjs";

export type OfficeHoursLabScenarioKind =
  | "allowed_day"
  | "geofence"
  | "member_flow"
  | "member_check_in"
  | "kiosk_status"
  | "kiosk_check_in"
  | "presence_ping"
  | "presence_heartbeat"
  | "shift_creation"
  | "admin_close_session";

export type OfficeHoursLabVerdict = "pass" | "warning" | "fail";
export type OfficeHoursLabTone = "neutral" | "good" | "warning" | "critical";

export type OfficeHoursLabTraceEntry = {
  label: string;
  value: string;
  tone?: OfficeHoursLabTone;
};

export type OfficeHoursLabCleanup = {
  attempted: boolean;
  ok: boolean;
  message: string | null;
};

export type OfficeHoursLabResult = {
  kind: OfficeHoursLabScenarioKind;
  mode: "simulate" | "live";
  verdict: OfficeHoursLabVerdict;
  resultCode: string | null;
  errorCode: string | null;
  headline: string;
  trace: OfficeHoursLabTraceEntry[];
  evidence: OfficeHoursLabTraceEntry[];
  cleanup: OfficeHoursLabCleanup;
};

export type OfficeHoursLabPreset = {
  id: string;
  label: string;
  description: string;
  kind: OfficeHoursLabScenarioKind;
  request: OfficeHoursLabRequest;
  supportedModes: Array<"simulate" | "live">;
};

export type OfficeHoursLabContext = {
  officeConfig: {
    quiet_hours_enabled?: boolean;
    quiet_hours_start_local?: string;
    quiet_hours_end_local?: string;
    weekly_hours_reminder_enabled?: boolean;
    weekly_hours_reminder_weekday?: number;
    weekly_hours_reminder_time_local?: string;
    office_hours_allow_weekends?: boolean;
    office_hours_allowed_weekdays?: number[];
    office_hours_extra_allowed_dates?: string[];
  } | null;
  officeLocation: {
    name?: string | null;
    timezone?: string | null;
    lat?: number | null;
    lon?: number | null;
    radius_m?: number | null;
    grace_radius_m?: number | null;
  } | null;
};

export type OfficeHoursLabRequest = {
  kind: OfficeHoursLabScenarioKind;
  timestamp: string;
  userId?: string | null;
  lat?: number | null;
  lon?: number | null;
  policyOverride?: {
    office_hours_allow_weekends?: boolean;
    office_hours_allowed_weekdays?: number[];
    office_hours_extra_allowed_dates?: string[];
  };
  locationOverride?: {
    name?: string | null;
    timezone?: string | null;
    lat?: number | null;
    lon?: number | null;
    radius_m?: number | null;
    grace_radius_m?: number | null;
  };
  hasPhoto?: boolean;
  preflightReady?: boolean;
  preflightAllowed?: boolean;
  hasOpenSession?: boolean;
  phoneMatched?: boolean;
  shift?: {
    userId?: string | null;
    startsAt: string;
    endsAt: string;
    officeLocationId?: string | null;
  };
  adminClose?: {
    checkoutAt: string;
    excludeFromTotals?: boolean;
    reason?: string;
  };
  session?: {
    checkinAt: string;
    lastPresenceAt?: string | null;
    requiresPresence?: boolean;
  } | null;
};

type DayPolicyResult = {
  allowed: boolean;
  isoWeekday: number;
  localDate: string;
  localTime: string;
  weekdayLabel: string;
  allowedByWeekendShortcut: boolean;
  allowedByWeekday: boolean;
  allowedByExtraDate: boolean;
};

function safeDate(value: string): Date | null {
  const next = new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function getOfficeTimeZone(context: OfficeHoursLabContext | Pick<OfficeHoursLabContext, "officeLocation"> | null | undefined): string {
  return context?.officeLocation?.timezone?.trim() || "America/Los_Angeles";
}

function formatInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";

  return {
    localDate: `${year}-${month}-${day}`,
    localTime: `${hour}:${minute}`,
    weekday,
  };
}

function weekdayToIso(weekday: string): number {
  switch (weekday) {
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    case "Sun":
      return 7;
    default:
      return 1;
  }
}

function describeIsoWeekdays(days: number[] | undefined): string {
  if (!Array.isArray(days) || days.length === 0) return "Mon-Fri";
  const labels = days.map((day) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day] ?? String(day));
  return labels.join(", ");
}

function defaultCleanup(): OfficeHoursLabCleanup {
  return { attempted: false, ok: true, message: null };
}

function resolveContextWithOverrides(context: OfficeHoursLabContext, request: OfficeHoursLabRequest): OfficeHoursLabContext {
  return {
    officeConfig: {
      ...(context.officeConfig ?? {}),
      ...(request.policyOverride ?? {}),
    },
    officeLocation: {
      ...(context.officeLocation ?? {}),
      ...(request.locationOverride ?? {}),
    },
  };
}

function buildResult({
  kind,
  verdict,
  resultCode = null,
  errorCode = null,
  headline,
  trace,
  evidence,
}: {
  kind: OfficeHoursLabScenarioKind;
  verdict: OfficeHoursLabVerdict;
  resultCode?: string | null;
  errorCode?: string | null;
  headline: string;
  trace: OfficeHoursLabTraceEntry[];
  evidence: OfficeHoursLabTraceEntry[];
}): OfficeHoursLabResult {
  return {
    kind,
    mode: "simulate",
    verdict,
    resultCode,
    errorCode,
    headline,
    trace,
    evidence,
    cleanup: defaultCleanup(),
  };
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const radius = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return Math.round(radius * c);
}

export function evaluateOfficeHoursDayPolicy({
  timestamp,
  officeConfig,
  officeLocation,
}: {
  timestamp: string;
  officeConfig: OfficeHoursLabContext["officeConfig"];
  officeLocation: OfficeHoursLabContext["officeLocation"];
}): DayPolicyResult {
  const date = safeDate(timestamp) ?? new Date();
  const timeZone = getOfficeTimeZone({ officeLocation });
  const { localDate, localTime, weekday } = formatInTimeZone(date, timeZone);
  const isoWeekday = weekdayToIso(weekday);
  const allowedWeekdays = officeConfig?.office_hours_allowed_weekdays ?? [1, 2, 3, 4, 5];
  const extraDates = officeConfig?.office_hours_extra_allowed_dates ?? [];
  const allowedByWeekendShortcut = officeConfig?.office_hours_allow_weekends === true;
  const allowedByWeekday = allowedWeekdays.includes(isoWeekday);
  const allowedByExtraDate = extraDates.includes(localDate);

  return {
    allowed: allowedByWeekendShortcut || allowedByWeekday || allowedByExtraDate,
    isoWeekday,
    localDate,
    localTime,
    weekdayLabel: weekday,
    allowedByWeekendShortcut,
    allowedByWeekday,
    allowedByExtraDate,
  };
}

export function classifyOfficeHoursLabGeofence({
  distanceM,
  radiusM,
  graceRadiusM,
}: {
  distanceM: number;
  radiusM: number;
  graceRadiusM: number;
}): {
  band: "in_radius" | "in_grace" | "outside_grace";
  verdict: OfficeHoursLabVerdict;
  statusTone: "good" | "warning" | "critical";
  statusLabel: string;
} {
  const status = mapDistanceToPreflightStatus({ distanceM, radiusM, graceRadiusM }) as {
    band: "in_radius" | "in_grace" | "outside_grace";
    statusTone: "good" | "warning" | "critical";
    statusLabel: string;
  };
  return {
    ...status,
    verdict: status.band === "in_radius" ? "pass" : status.band === "in_grace" ? "warning" : "fail",
  };
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function simulateAllowedDay(context: OfficeHoursLabContext, request: OfficeHoursLabRequest): OfficeHoursLabResult {
  const resolvedContext = resolveContextWithOverrides(context, request);
  const policy = evaluateOfficeHoursDayPolicy({
    timestamp: request.timestamp,
    officeConfig: resolvedContext.officeConfig,
    officeLocation: resolvedContext.officeLocation,
  });

  return buildResult({
    kind: "allowed_day",
    verdict: policy.allowed ? "pass" : "fail",
    resultCode: policy.allowed ? "day_allowed" : null,
    errorCode: policy.allowed ? null : "weekend_not_allowed",
    headline: policy.allowed ? "Office hours are enabled for this office date" : "Office hours are blocked for this office date",
    trace: [
      { label: "Scenario", value: "Allowed day policy" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Office date", value: `${policy.localDate} (${policy.weekdayLabel})` },
      { label: "Local time", value: policy.localTime },
    ],
    evidence: [
      { label: "Weekend shortcut", value: policy.allowedByWeekendShortcut ? "On" : "Off" },
      { label: "Allowed weekdays", value: describeIsoWeekdays(resolvedContext.officeConfig?.office_hours_allowed_weekdays) },
      {
        label: "Extra dates",
        value: (resolvedContext.officeConfig?.office_hours_extra_allowed_dates ?? []).join(", ") || "None",
      },
      { label: "Allowed by weekday", value: policy.allowedByWeekday ? "Yes" : "No" },
      { label: "Allowed by extra date", value: policy.allowedByExtraDate ? "Yes" : "No" },
    ],
  });
}

function simulateGeofence(context: OfficeHoursLabContext, request: OfficeHoursLabRequest): OfficeHoursLabResult {
  const office = resolveContextWithOverrides(context, request).officeLocation;
  const officeLat = office?.lat;
  const officeLon = office?.lon;
  const radiusM = office?.radius_m;
  const graceRadiusM = office?.grace_radius_m;
  const requestLat = request.lat;
  const requestLon = request.lon;
  if (
    !office ||
    !isFiniteNumber(officeLat) ||
    !isFiniteNumber(officeLon) ||
    !isFiniteNumber(radiusM) ||
    !isFiniteNumber(graceRadiusM) ||
    !isFiniteNumber(requestLat) ||
    !isFiniteNumber(requestLon)
  ) {
    return buildResult({
      kind: "geofence",
      verdict: "fail",
      errorCode: "office_location_not_configured",
      headline: "Geofence cannot be evaluated without office coordinates",
      trace: [
        { label: "Scenario", value: "Geofence" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Office setup", value: "Missing coordinates or radii" }],
    });
  }

  const distanceM = haversineMeters(requestLat, requestLon, officeLat, officeLon);
  const geofence = classifyOfficeHoursLabGeofence({
    distanceM,
    radiusM,
    graceRadiusM,
  });

  return buildResult({
    kind: "geofence",
    verdict: geofence.verdict,
    resultCode: geofence.band,
    errorCode: geofence.band === "outside_grace" ? "outside_geofence" : null,
    headline:
      geofence.band === "in_radius"
        ? "Geofence is safely inside the office radius"
        : geofence.band === "in_grace"
          ? "Geofence is in the grace zone"
          : "Geofence is outside the allowed office range",
    trace: [
      { label: "Scenario", value: "Geofence" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Distance", value: `${distanceM} m` },
      { label: "Band", value: geofence.band.replaceAll("_", " ") },
    ],
    evidence: [
      { label: "Office", value: office.name ?? "Office" },
      { label: "Radius", value: `${radiusM} m` },
      { label: "Grace radius", value: `${graceRadiusM} m` },
      { label: "Status", value: geofence.statusLabel },
    ],
  });
}

function simulateMemberFlow(context: OfficeHoursLabContext, request: OfficeHoursLabRequest): OfficeHoursLabResult {
  const flow = getMemberKioskFlowModel({
    mode: request.hasOpenSession ? "check_out" : "check_in",
    hasPhoto: Boolean(request.hasPhoto),
    preflightReady: Boolean(request.preflightReady),
    preflightAllowed: Boolean(request.preflightAllowed),
  });

  const verdict =
    flow.currentStep === "submit" || flow.currentStep === "confirm" ? "pass" : flow.currentStep === "location" ? "warning" : "warning";
  const resultCode = `member_flow_${flow.currentStep}`;
  const headline =
    flow.currentStep === "selfie"
      ? "Member flow is waiting on a selfie"
      : flow.currentStep === "location"
        ? "Member flow is waiting on location"
        : flow.currentStep === "submit"
          ? "Member flow is ready to submit"
          : "Member flow is ready to check out";

  return buildResult({
    kind: "member_flow",
    verdict,
    resultCode,
    headline,
    trace: [
      { label: "Scenario", value: "Member flow" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Current step", value: flow.currentStep },
      { label: "Next section", value: flow.nextSectionId },
    ],
    evidence: flow.sections.map((section) => ({
      label: section.id,
      value: `${section.state}${section.expanded ? " · expanded" : ""}`,
    })),
  });
}

function simulateKioskStatus(request: OfficeHoursLabRequest): OfficeHoursLabResult {
  if (!request.phoneMatched) {
    return buildResult({
      kind: "kiosk_status",
      verdict: "fail",
      errorCode: "phone_not_allowed",
      headline: "Kiosk status blocks this phone number",
      trace: [
        { label: "Scenario", value: "Kiosk status" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
        { label: "Intent", value: "blocked" },
        { label: "Phone match", value: "No" },
      ],
      evidence: [{ label: "Open session", value: request.hasOpenSession ? "Yes" : "No" }],
    });
  }

  const resultCode = request.hasOpenSession ? "kiosk_status_check_out" : "kiosk_status_check_in";
  return buildResult({
    kind: "kiosk_status",
    verdict: "pass",
    resultCode,
    headline: request.hasOpenSession ? "Kiosk status resolves to check out" : "Kiosk status resolves to check in",
    trace: [
      { label: "Scenario", value: "Kiosk status" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Intent", value: request.hasOpenSession ? "check_out" : "check_in" },
      { label: "Phone match", value: "Yes" },
    ],
    evidence: [{ label: "Open session", value: request.hasOpenSession ? "Yes" : "No" }],
  });
}

function simulatePresence(context: OfficeHoursLabContext, request: OfficeHoursLabRequest): OfficeHoursLabResult {
  const session = request.session;
  if (!session?.checkinAt) {
    return buildResult({
      kind: request.kind,
      verdict: "fail",
      errorCode: "no_open_session",
      headline: "Presence rules need an open session to evaluate",
      trace: [
        { label: "Scenario", value: request.kind === "presence_ping" ? "Presence ping" : "Presence heartbeat" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Session", value: "Missing" }],
    });
  }

  if (session.requiresPresence === false) {
    return buildResult({
      kind: request.kind,
      verdict: "pass",
      resultCode: "presence_ignored",
      headline: "Presence enforcement is disabled for this session",
      trace: [
        { label: "Scenario", value: request.kind === "presence_ping" ? "Presence ping" : "Presence heartbeat" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
        { label: "Action", value: "ignored" },
      ],
      evidence: [{ label: "Requires presence", value: "No" }],
    });
  }

  const policy = getOfficeHoursPresencePolicy();
  const now = safeDate(request.timestamp) ?? new Date();
  const lastSeen = safeDate(session.lastPresenceAt ?? session.checkinAt) ?? now;
  const timeZone = getOfficeTimeZone(context);
  const localNow = formatInTimeZone(now, timeZone);
  const minutesStale = Math.floor((now.getTime() - lastSeen.getTime()) / 60_000);
  const afterHours = Number(localNow.localTime.slice(0, 2)) >= policy.enforceAfterHourLocal;
  const timedOut = afterHours && minutesStale >= policy.inactivityTimeoutMinutes;

  return buildResult({
    kind: request.kind,
    verdict: timedOut ? "fail" : "pass",
    resultCode: timedOut ? "presence_checked_out" : "presence_ok",
    errorCode: timedOut ? "presence_timeout_after_5pm" : null,
    headline: timedOut ? "Presence policy would auto-close this session" : "Presence policy keeps this session open",
    trace: [
      { label: "Scenario", value: request.kind === "presence_ping" ? "Presence ping" : "Presence heartbeat" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Local time", value: localNow.localTime },
      { label: "Action", value: timedOut ? "checked_out" : "ok" },
    ],
    evidence: [
      { label: "Check-in", value: session.checkinAt },
      { label: "Last presence", value: session.lastPresenceAt ?? session.checkinAt },
      { label: "Minutes stale", value: `${Math.max(0, minutesStale)} min` },
      { label: "Enforce after", value: `${policy.enforceAfterHourLocal}:00 local` },
    ],
  });
}

function simulateMemberCheckIn(context: OfficeHoursLabContext, request: OfficeHoursLabRequest): OfficeHoursLabResult {
  const resolvedContext = resolveContextWithOverrides(context, request);
  if (request.hasOpenSession) {
    return buildResult({
      kind: "member_check_in",
      verdict: "fail",
      errorCode: "already_checked_in",
      headline: "Member check-in would be rejected because a session is already open",
      trace: [
        { label: "Scenario", value: "Member check-in" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Open session", value: "Yes" }],
    });
  }

  if (!isFiniteNumber(request.lat) || !isFiniteNumber(request.lon)) {
    return buildResult({
      kind: "member_check_in",
      verdict: "fail",
      errorCode: "location_required",
      headline: "Member check-in needs a live location",
      trace: [
        { label: "Scenario", value: "Member check-in" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Location", value: "Missing" }],
    });
  }

  const dayResult = simulateAllowedDay(resolvedContext, { ...request, kind: "allowed_day" });
  if (dayResult.errorCode) {
    return buildResult({
      kind: "member_check_in",
      verdict: "fail",
      errorCode: dayResult.errorCode,
      headline: "Member check-in is blocked by the office-hours day policy",
      trace: [
        { label: "Scenario", value: "Member check-in" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: dayResult.evidence,
    });
  }

  const geofence = simulateGeofence(resolvedContext, { ...request, kind: "geofence" });
  if (geofence.errorCode) {
    return buildResult({
      kind: "member_check_in",
      verdict: "fail",
      errorCode: geofence.errorCode,
      headline: "Member check-in is outside the office geofence",
      trace: [
        { label: "Scenario", value: "Member check-in" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: geofence.evidence,
    });
  }

  return buildResult({
    kind: "member_check_in",
    verdict: geofence.verdict,
    resultCode: geofence.verdict === "warning" ? "member_check_in_grace" : "member_check_in_ok",
    headline:
      geofence.verdict === "warning"
        ? "Member check-in would succeed in the grace zone"
        : "Member check-in would succeed",
    trace: [
      { label: "Scenario", value: "Member check-in" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
    ],
    evidence: geofence.evidence,
  });
}

function simulateKioskCheckIn(context: OfficeHoursLabContext, request: OfficeHoursLabRequest): OfficeHoursLabResult {
  const resolvedContext = resolveContextWithOverrides(context, request);
  if (!request.phoneMatched) {
    return buildResult({
      kind: "kiosk_check_in",
      verdict: "fail",
      errorCode: "phone_not_allowed",
      headline: "Kiosk check-in would be blocked for this phone number",
      trace: [
        { label: "Scenario", value: "Kiosk check-in" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Phone match", value: "No" }],
    });
  }

  if (request.hasOpenSession) {
    return buildResult({
      kind: "kiosk_check_in",
      verdict: "fail",
      errorCode: "already_checked_in",
      headline: "Kiosk check-in would reject this user because a session is already open",
      trace: [
        { label: "Scenario", value: "Kiosk check-in" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Open session", value: "Yes" }],
    });
  }

  const geofence = simulateGeofence(resolvedContext, { ...request, kind: "geofence" });
  const dayPolicy = evaluateOfficeHoursDayPolicy({
    timestamp: request.timestamp,
    officeConfig: resolvedContext.officeConfig,
    officeLocation: resolvedContext.officeLocation,
  });

  const shaped = shapeLocationCheckResult({
    decision: { allowed: true },
    dayAllowed: dayPolicy.allowed,
    distanceM: Number(geofence.trace.find((entry) => entry.label === "Distance")?.value.replace(" m", "")) || 0,
    radiusM: resolvedContext.officeLocation?.radius_m ?? 0,
    graceRadiusM: resolvedContext.officeLocation?.grace_radius_m ?? 0,
  });

  if (!shaped.dayAllowed) {
    return buildResult({
      kind: "kiosk_check_in",
      verdict: "fail",
      errorCode: "weekend_not_allowed",
      headline: "Kiosk check-in is blocked by the office-hours day policy",
      trace: [
        { label: "Scenario", value: "Kiosk check-in" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Day status", value: shaped.statusLabel }],
    });
  }

  if (!shaped.ok) {
    return buildResult({
      kind: "kiosk_check_in",
      verdict: "fail",
      errorCode: "outside_geofence",
      headline: "Kiosk check-in would fail outside the office range",
      trace: [
        { label: "Scenario", value: "Kiosk check-in" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [
        { label: "Day status", value: dayPolicy.allowed ? "Allowed" : "Blocked" },
        { label: "Location status", value: shaped.statusLabel },
      ],
    });
  }

  return buildResult({
    kind: "kiosk_check_in",
    verdict: shaped.band === "in_grace" ? "warning" : "pass",
    resultCode: shaped.band === "in_grace" ? "kiosk_check_in_grace" : "kiosk_check_in_ok",
    headline:
      shaped.band === "in_grace"
        ? "Kiosk check-in would succeed in the grace zone"
        : "Kiosk check-in would succeed",
    trace: [
      { label: "Scenario", value: "Kiosk check-in" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Band", value: shaped.band },
    ],
    evidence: [
      { label: "Day status", value: "Allowed" },
      { label: "Location status", value: shaped.statusLabel },
    ],
  });
}

function simulateShiftCreation(context: OfficeHoursLabContext, request: OfficeHoursLabRequest): OfficeHoursLabResult {
  const resolvedContext = resolveContextWithOverrides(context, request);
  const shift = request.shift;
  if (!shift?.startsAt || !shift.endsAt) {
    return buildResult({
      kind: "shift_creation",
      verdict: "fail",
      errorCode: "time_required",
      headline: "Shift creation needs both a start and end time",
      trace: [
        { label: "Scenario", value: "Shift creation" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Shift window", value: "Missing" }],
    });
  }

  const endMinusSecond = new Date(new Date(shift.endsAt).getTime() - 1000).toISOString();
  const startAllowed = evaluateOfficeHoursDayPolicy({
    timestamp: shift.startsAt,
    officeConfig: resolvedContext.officeConfig,
    officeLocation: resolvedContext.officeLocation,
  }).allowed;
  const endAllowed = evaluateOfficeHoursDayPolicy({
    timestamp: endMinusSecond,
    officeConfig: resolvedContext.officeConfig,
    officeLocation: resolvedContext.officeLocation,
  }).allowed;

  return buildResult({
    kind: "shift_creation",
    verdict: startAllowed && endAllowed ? "pass" : "fail",
    resultCode: startAllowed && endAllowed ? "shift_allowed" : null,
    errorCode: startAllowed && endAllowed ? null : "weekend_not_allowed",
    headline: startAllowed && endAllowed ? "Shift creation would be allowed" : "Shift creation is blocked by enabled office-hours days",
    trace: [
      { label: "Scenario", value: "Shift creation" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Starts", value: shift.startsAt },
      { label: "Ends", value: shift.endsAt },
    ],
    evidence: [
      { label: "Start day allowed", value: startAllowed ? "Yes" : "No" },
      { label: "End day allowed", value: endAllowed ? "Yes" : "No" },
    ],
  });
}

function simulateAdminCloseSession(request: OfficeHoursLabRequest): OfficeHoursLabResult {
  const session = request.session;
  const adminClose = request.adminClose;
  if (!session?.checkinAt) {
    return buildResult({
      kind: "admin_close_session",
      verdict: "fail",
      errorCode: "session_not_found",
      headline: "Admin close validation needs an open session",
      trace: [
        { label: "Scenario", value: "Admin close session" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Session", value: "Missing" }],
    });
  }
  if (!adminClose?.checkoutAt) {
    return buildResult({
      kind: "admin_close_session",
      verdict: "fail",
      errorCode: "checkout_at_required",
      headline: "Admin close validation needs a checkout time",
      trace: [
        { label: "Scenario", value: "Admin close session" },
        { label: "Mode", value: "Simulate" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "Checkout time", value: "Missing" }],
    });
  }

  const checkinAt = safeDate(session.checkinAt);
  const checkoutAt = safeDate(adminClose.checkoutAt);
  const valid = Boolean(checkinAt && checkoutAt && checkoutAt.getTime() > checkinAt.getTime());

  return buildResult({
    kind: "admin_close_session",
    verdict: valid ? "pass" : "fail",
    resultCode: valid ? "admin_close_valid" : null,
    errorCode: valid ? null : "invalid_checkout_time",
    headline: valid ? "Admin close validation would accept this checkout time" : "Admin close validation would reject this checkout time",
    trace: [
      { label: "Scenario", value: "Admin close session" },
      { label: "Mode", value: "Simulate" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Check-in", value: session.checkinAt },
      { label: "Checkout", value: adminClose.checkoutAt },
    ],
    evidence: [
      { label: "Reason", value: adminClose.reason?.trim() || "No reason provided" },
      { label: "Exclude from totals", value: adminClose.excludeFromTotals ? "Yes" : "No" },
    ],
  });
}

export function simulateOfficeHoursLab({
  context,
  request,
}: {
  context: OfficeHoursLabContext;
  request: OfficeHoursLabRequest;
}): OfficeHoursLabResult {
  switch (request.kind) {
    case "allowed_day":
      return simulateAllowedDay(context, request);
    case "geofence":
      return simulateGeofence(context, request);
    case "member_flow":
      return simulateMemberFlow(context, request);
    case "member_check_in":
      return simulateMemberCheckIn(context, request);
    case "kiosk_status":
      return simulateKioskStatus(request);
    case "kiosk_check_in":
      return simulateKioskCheckIn(context, request);
    case "presence_ping":
    case "presence_heartbeat":
      return simulatePresence(context, request);
    case "shift_creation":
      return simulateShiftCreation(context, request);
    case "admin_close_session":
      return simulateAdminCloseSession(request);
    default:
      return buildResult({
        kind: request.kind,
        verdict: "fail",
        errorCode: "unsupported_scenario",
        headline: "This Office Hours lab scenario is not supported yet",
        trace: [
          { label: "Scenario", value: request.kind },
          { label: "Mode", value: "Simulate" },
          { label: "Timestamp", value: request.timestamp },
        ],
        evidence: [],
      });
  }
}

export function getOfficeHoursLabPresets(context: OfficeHoursLabContext): OfficeHoursLabPreset[] {
  const timeZone = getOfficeTimeZone(context);
  const sundayTs = "2026-03-29T10:00:00-07:00";
  const mondayTs = "2026-03-30T10:00:00-07:00";

  return [
    {
      id: "blocked-weekend",
      label: "Blocked weekend",
      description: `Show the default blocked-day outcome in ${timeZone}.`,
      kind: "allowed_day",
      request: { kind: "allowed_day", timestamp: sundayTs },
      supportedModes: ["simulate"],
    },
    {
      id: "extra-date-weekend",
      label: "Weekend extra date",
      description: "Verify that an explicit extra allowed date overrides the normal weekday policy.",
      kind: "allowed_day",
      request: {
        kind: "allowed_day",
        timestamp: sundayTs,
        policyOverride: {
          office_hours_extra_allowed_dates: ["2026-03-29"],
        },
      },
      supportedModes: ["simulate"],
    },
    {
      id: "in-grace-zone",
      label: "Grace zone",
      description: "Evaluate the grace-zone verdict without going fully out of range.",
      kind: "geofence",
      request: { kind: "geofence", timestamp: mondayTs, lat: 32.71616, lon: -117.1611 },
      supportedModes: ["simulate"],
    },
    {
      id: "outside-geofence",
      label: "Outside geofence",
      description: "Force a location outside the grace radius.",
      kind: "geofence",
      request: { kind: "geofence", timestamp: mondayTs, lat: 32.7166, lon: -117.1611 },
      supportedModes: ["simulate"],
    },
    {
      id: "member-location-gate",
      label: "Member location gate",
      description: "Show the member flow waiting on location after the selfie step.",
      kind: "member_flow",
      request: {
        kind: "member_flow",
        timestamp: mondayTs,
        hasPhoto: true,
        preflightReady: false,
        preflightAllowed: false,
      },
      supportedModes: ["simulate"],
    },
    {
      id: "kiosk-open-session",
      label: "Kiosk open session",
      description: "Flip kiosk status into check-out mode.",
      kind: "kiosk_status",
      request: {
        kind: "kiosk_status",
        timestamp: mondayTs,
        phoneMatched: true,
        hasOpenSession: true,
      },
      supportedModes: ["simulate", "live"],
    },
    {
      id: "presence-timeout-after-hours",
      label: "Presence timeout",
      description: "Simulate the after-5pm 15-minute auto-close rule.",
      kind: "presence_ping",
      request: {
        kind: "presence_ping",
        timestamp: "2026-03-30T17:20:00-07:00",
        session: {
          checkinAt: "2026-03-30T15:30:00-07:00",
          lastPresenceAt: "2026-03-30T17:00:00-07:00",
          requiresPresence: true,
        },
      },
      supportedModes: ["simulate", "live"],
    },
    {
      id: "shift-blocked-day",
      label: "Blocked shift day",
      description: "Simulate admin shift creation on a disabled day.",
      kind: "shift_creation",
      request: {
        kind: "shift_creation",
        timestamp: sundayTs,
        shift: {
          startsAt: "2026-03-29T10:00:00-07:00",
          endsAt: "2026-03-29T11:00:00-07:00",
        },
      },
      supportedModes: ["simulate", "live"],
    },
    {
      id: "admin-close-invalid-time",
      label: "Invalid admin close",
      description: "Reject a checkout time that does not come after check-in.",
      kind: "admin_close_session",
      request: {
        kind: "admin_close_session",
        timestamp: mondayTs,
        session: {
          checkinAt: "2026-03-30T12:00:00-07:00",
        },
        adminClose: {
          checkoutAt: "2026-03-30T11:30:00-07:00",
          excludeFromTotals: false,
          reason: "Lab validation",
        },
      },
      supportedModes: ["simulate", "live"],
    },
  ];
}

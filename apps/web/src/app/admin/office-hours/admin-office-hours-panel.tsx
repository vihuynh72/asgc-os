"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminDrawer } from "@/components/admin/admin-drawer";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { computeAdminOverrideMinutes, validateAdminCheckoutAt } from "@/lib/office-hours-admin-overrides.mjs";
import { buildOfficeHoursSessionsWorkspaceModel, getOfficeHourShiftActionState } from "@/lib/office-hours-admin-workspace.mjs";
import { hoursStatusLabel, rosterStatusLabel } from "@/lib/office-hours-weekly-report.mjs";
import { shouldCloseOnBackdrop } from "@/lib/lightbox-utils.mjs";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

type OfficeLocationRow = {
  id: string;
  name: string;
  timezone: string | null;
};

type WeeklyRow = {
  user_id: string;
  week_start: string;
  role_key: string | null;
  role: string;
  name: string;
  email: string;
  required_hours: number;
  total_hours: number;
  missing_hours: number;
  needs_review_sessions: number;
  member_status: "assigned" | "vacant" | "no_show";
};

type OfficeHourAdminSession = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  user_is_allowlisted?: boolean;
  office_location_id: string | null;
  office_location_name: string;
  office_location_timezone: string;
  checkin_at: string;
  checkout_at: string | null;
  status: string;
  duration_minutes: number | null;
  has_kiosk_selfie?: boolean;
  kiosk_auth_method?: string | null;
  kiosk_phone_last4?: string | null;
  within_radius: boolean | null;
  within_grace: boolean | null;
  distance_m_at_checkin: number | null;
  distance_m_at_checkout: number | null;
  admin_closed_by?: string | null;
  admin_closed_at?: string | null;
  admin_closed_reason?: string | null;
  admin_adjusted_checkout_at?: string | null;
  admin_exclude_from_totals?: boolean | null;
};

type ShiftRow = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  office_location_id: string;
  office_location_name: string;
  office_location_timezone: string;
  starts_at: string;
  ends_at: string;
  status: string;
  covered_by_user_id: string | null;
  covered_by_display_name: string;
  covered_by_email: string;
  open_coverage_request_count: number;
  claimed_coverage_request_count: number;
};

type ViewMode = "day" | "week" | "month";

type SessionCell = {
  key: string;
  date: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  hasShift: boolean;
  shift: ShiftRow | null;
  primaryShift: ShiftRow | null;
  shifts: ShiftRow[];
  sessions: OfficeHourAdminSession[];
  coverageState: "cancelled" | "covered" | "coverage_requested" | null;
  sessionState: "checked_in_now" | "completed_today" | "no_session_yet" | null;
  isUnscheduledSession: boolean;
  actionState: {
    canEdit: boolean;
    canCancel: boolean;
  };
};

type TodayBlocker = {
  kind: "coverage_request" | "review_flag" | "missed_expected_activity";
  shiftId: string;
  userId: string;
  label: string;
};

type PerformanceRow = WeeklyRow & {
  statusKey: "complete" | "missing" | "behind" | "not_required";
  completion: number;
};

type WorkspaceModel = {
  weekStart: string;
  weekDays: Array<{
    date: string;
    isToday: boolean;
  }>;
  rows: Array<{
    userId: string;
    userDisplayName: string;
    userEmail: string;
    role: string;
    memberStatus: "assigned" | "vacant" | "no_show";
    performanceStatusKey: "complete" | "missing" | "behind" | "not_required" | null;
    completion: number;
    requiredHours: number;
    totalHours: number;
    reviewCount: number;
    cells: SessionCell[];
  }>;
  executive: {
    weekCompletionLabel: string;
    openSessions: number;
    scheduledToday: number;
    attentionItems: number;
    membersBehind: number;
  };
  today: {
    date: string;
    onShiftCells: SessionCell[];
    openSessions: OfficeHourAdminSession[];
    upcomingCells: SessionCell[];
    blockers: TodayBlocker[];
  };
  performanceRows: PerformanceRow[];
};

type ShiftFormState = {
  userId: string;
  officeLocationId: string;
  startsAt: string;
  endsAt: string;
};

function parseDateUtc(dateStr: string): Date {
  const iso = normalizeDateOnlyString(dateStr) ?? todayDateString();
  return new Date(`${iso}T12:00:00Z`);
}

function startOfMonth(dateStr: string): string {
  const date = parseDateUtc(dateStr);
  return date.toISOString().slice(0, 7) + "-01";
}

function startOfNextMonth(dateStr: string): string {
  const date = parseDateUtc(dateStr);
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
}

function buildLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateHeading(value: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone ?? undefined,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone ?? undefined,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimeInTz(iso: string, timeZone: string | null): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone ?? undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateKeyInTz(iso: string, timeZone: string | null): string {
  const date = new Date(iso);
  if (!timeZone) return iso.slice(0, 10);

  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatTimeRange(start: string, end: string, timeZone?: string | null): string {
  return `${formatDateTime(start, timeZone)} to ${formatDateTime(end, timeZone)}`;
}

function formatHours(value: number): string {
  return `${Math.round(value * 10) / 10}h`;
}

function formatMinutes(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${hours}h ${remainder}m`;
}

function shiftStatusLabel(status: string) {
  if (status === "cancelled") return "Cancelled";
  if (status === "completed") return "Completed";
  if (status === "missed") return "Missed";
  return "Scheduled";
}

function shiftStatusClasses(status: string) {
  if (status === "cancelled") return "bg-rose-500/10 text-rose-700";
  if (status === "completed") return "bg-emerald-500/10 text-emerald-700";
  if (status === "missed") return "bg-amber-500/12 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function coverageLabel(coverageState: string | null) {
  if (coverageState === "covered") return "Covered";
  if (coverageState === "coverage_requested") return "Coverage requested";
  if (coverageState === "cancelled") return "Cancelled";
  return null;
}

function coverageClasses(coverageState: string | null) {
  if (coverageState === "covered") return "bg-sky-500/10 text-sky-700";
  if (coverageState === "coverage_requested") return "bg-amber-500/12 text-amber-700";
  if (coverageState === "cancelled") return "bg-rose-500/10 text-rose-700";
  return "";
}

function sessionStateLabel(sessionState: string | null) {
  if (sessionState === "checked_in_now") return "Open now";
  if (sessionState === "completed_today") return "Completed today";
  if (sessionState === "no_session_yet") return "No session yet";
  return null;
}

function sessionStateClasses(sessionState: string | null) {
  if (sessionState === "checked_in_now") return "bg-emerald-500/10 text-emerald-700";
  if (sessionState === "completed_today") return "bg-slate-100 text-slate-700";
  if (sessionState === "no_session_yet") return "bg-rose-500/10 text-rose-700";
  return "";
}

function performanceClasses(statusKey: string) {
  if (statusKey === "complete") return "bg-emerald-500/10 text-emerald-700";
  if (statusKey === "behind") return "bg-amber-500/12 text-amber-700";
  if (statusKey === "missing") return "bg-rose-500/10 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function rosterClasses(status: "assigned" | "vacant" | "no_show") {
  if (status === "no_show") return "bg-rose-500/10 text-rose-700";
  if (status === "vacant") return "bg-amber-500/12 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function formatAuthMethodLabel(method: string | null | undefined): string {
  switch (method) {
    case "selfie":
      return "Selfie";
    case "sms_otp":
      return "SMS OTP";
    default:
      return "Standard";
  }
}

function formatMaskedPhone(method: string | null | undefined, last4: string | null | undefined): string | null {
  if (method !== "sms_otp" || !last4) return null;
  return `***-***-${last4}`;
}

function buildWorkspaceHref({ date, userId, view }: { date: string; userId?: string | null; view: ViewMode }) {
  const params = new URLSearchParams({ date, view });
  if (userId) params.set("userId", userId);
  return `/admin/office-hours?${params.toString()}`;
}

function buildDayHref(userId: string | null | undefined, date: string) {
  return buildWorkspaceHref({ date, userId, view: "day" });
}


async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function sendJson<T>(url: string, method: "POST" | "PATCH", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function defaultForm({
  date,
  initialUserId,
  initialLocationId,
}: {
  date: string;
  initialUserId: string;
  initialLocationId: string;
}): ShiftFormState {
  return {
    userId: initialUserId,
    officeLocationId: initialLocationId,
    startsAt: `${date}T10:00`,
    endsAt: `${date}T11:00`,
  };
}

function prefillFormFromCell({
  cell,
  shift,
  initialLocationId,
}: {
  cell: SessionCell;
  shift?: ShiftRow | null;
  initialLocationId: string;
}): ShiftFormState {
  if (shift) {
    return {
      userId: shift.user_id,
      officeLocationId: shift.office_location_id,
      startsAt: buildLocalDateTimeInput(shift.starts_at),
      endsAt: buildLocalDateTimeInput(shift.ends_at),
    };
  }

  const firstSession = cell.sessions[0];
  return {
    userId: cell.userId,
    officeLocationId: firstSession?.office_location_id ?? initialLocationId,
    startsAt: firstSession ? buildLocalDateTimeInput(firstSession.checkin_at) : `${cell.date}T10:00`,
    endsAt:
      firstSession && firstSession.checkout_at
        ? buildLocalDateTimeInput(firstSession.checkout_at)
        : `${cell.date}T11:00`,
  };
}

export function AdminOfficeHoursPanel({
  initialUsers,
  initialLocations,
  initialSelectedUserId = "",
  initialAnchorDate,
  initialView = "week",
  initialComposeOpen = false,
}: {
  initialUsers: UserRow[];
  initialLocations: OfficeLocationRow[];
  initialSelectedUserId?: string;
  initialAnchorDate?: string;
  initialView?: ViewMode;
  initialComposeOpen?: boolean;
}) {
  const [view, setView] = useState<ViewMode>(initialView);
  const [anchorDate, setAnchorDate] = useState<string>(() => normalizeDateOnlyString(initialAnchorDate ?? "") ?? todayDateString());
  const [selectedUserId, setSelectedUserId] = useState<string>(initialSelectedUserId);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Record<string, boolean>>({
    open: true,
    closed: true,
    auto_closed: true,
    voided: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tz, setTz] = useState<string | null>(null);
  const [sessions, setSessions] = useState<OfficeHourAdminSession[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [weekRows, setWeekRows] = useState<WeeklyRow[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(initialComposeOpen);
  const [drawerMode, setDrawerMode] = useState<"create" | "detail">(initialComposeOpen ? "create" : "detail");
  const [selectedCellKey, setSelectedCellKey] = useState("");
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [, setDraftDate] = useState<string>(() => startOfWeekMondayDateOnly(initialAnchorDate ?? todayDateString()) ?? todayDateString());
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ShiftFormState>(
    defaultForm({
      date: startOfWeekMondayDateOnly(initialAnchorDate ?? todayDateString()) ?? todayDateString(),
      initialUserId: initialSelectedUserId || initialUsers[0]?.id || "",
      initialLocationId: initialLocations[0]?.id || "",
    }),
  );

  const [selfieSession, setSelfieSession] = useState<OfficeHourAdminSession | null>(null);
  const [selfieUrl, setSelfieUrl] = useState("");
  const [selfieLoading, setSelfieLoading] = useState(false);
  const [selfieError, setSelfieError] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideSession, setOverrideSession] = useState<OfficeHourAdminSession | null>(null);
  const [overrideCheckoutLocal, setOverrideCheckoutLocal] = useState("");
  const [overrideExclude, setOverrideExclude] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState("");
  const [overrideMessageKind, setOverrideMessageKind] = useState<"success" | "warning" | "error" | "">("");
  const [perfOpen, setPerfOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>(() => todayDateString());

  const enabledStatuses = useMemo(
    () => Object.entries(statusFilter).filter(([, on]) => on).map(([status]) => status),
    [statusFilter],
  );
  const weekStart = useMemo(
    () => startOfWeekMondayDateOnly(anchorDate) ?? todayDateString(),
    [anchorDate],
  );

  const { startDate, endDate } = useMemo(() => {
    if (view === "day") {
      const start = normalizeDateOnlyString(anchorDate) ?? todayDateString();
      return { startDate: start, endDate: addDaysDateOnly(start, 1) ?? start };
    }

    if (view === "week") {
      const start = startOfWeekMondayDateOnly(anchorDate) ?? todayDateString();
      return { startDate: start, endDate: addDaysDateOnly(start, 7) ?? start };
    }

    const monthStart = startOfMonth(anchorDate);
    return { startDate: monthStart, endDate: startOfNextMonth(anchorDate) };
  }, [anchorDate, view]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const sessionsParams = new URLSearchParams({
        startDate,
        endDate,
        limit: view === "month" ? "5000" : "2000",
      });
      if (selectedUserId) sessionsParams.set("userId", selectedUserId);
      if (enabledStatuses.length > 0) sessionsParams.set("status", enabledStatuses.join(","));

      const shiftsParams = new URLSearchParams({ weekStart });
      if (selectedUserId) shiftsParams.set("userId", selectedUserId);

      const [sessionsData, shiftsData, weeklyData] = await Promise.all([
        fetchJson<{ tz: string; sessions: OfficeHourAdminSession[] }>(
          `/api/admin/office-hours/sessions?${sessionsParams.toString()}`,
        ),
        fetchJson<{ shifts: ShiftRow[] }>(`/api/admin/office-hours/shifts?${shiftsParams.toString()}`),
        fetchJson<{ rows: WeeklyRow[] }>(
          `/api/admin/office-hours/export-week?format=json&disposition=inline&weekStart=${encodeURIComponent(weekStart)}`,
        ),
      ]);

      setTz(sessionsData.tz || null);
      setSessions(sessionsData.sessions ?? []);
      setShifts(shiftsData.shifts ?? []);
      setWeekRows((weeklyData.rows ?? []).filter((row) => !selectedUserId || row.user_id === selectedUserId));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load Office Hours.");
    } finally {
      setLoading(false);
    }
  }, [enabledStatuses, endDate, selectedUserId, startDate, view, weekStart]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const searchQuery = search.trim().toLowerCase();
  const filteredSessions = useMemo(() => {
    const enabled = new Set(enabledStatuses);
    return sessions.filter((session) => {
      if (enabled.size > 0 && !enabled.has(session.status)) return false;
      if (!searchQuery) return true;
      const haystack = [
        session.user_display_name,
        session.user_email,
        session.office_location_name,
        session.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchQuery);
    });
  }, [enabledStatuses, searchQuery, sessions]);

  const filteredShifts = useMemo(() => {
    if (!searchQuery) return shifts;
    return shifts.filter((shift) => {
      const haystack = [
        shift.user_display_name,
        shift.user_email,
        shift.office_location_name,
        shift.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchQuery);
    });
  }, [searchQuery, shifts]);

  const filteredWeekRows = useMemo(() => {
    if (!searchQuery) return weekRows;
    return weekRows.filter((row) => {
      const haystack = [row.name, row.email, row.role].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(searchQuery);
    });
  }, [searchQuery, weekRows]);

  const nowIso = new Date().toISOString();
  const today = todayDateString();
  const model = useMemo(
    () =>
      buildOfficeHoursSessionsWorkspaceModel({
        weekStart,
        todayDate: today,
        nowIso,
        users: initialUsers,
        selectedUserId,
        weekRows: filteredWeekRows,
        shifts: filteredShifts,
        sessions: filteredSessions,
      }) as WorkspaceModel,
    [filteredSessions, filteredShifts, filteredWeekRows, initialUsers, nowIso, selectedUserId, today, weekStart],
  );
  const sessionsByDay = useMemo(() => {
    const byDay = new Map<string, OfficeHourAdminSession[]>();
    for (const session of filteredSessions) {
      const dateKey = formatDateKeyInTz(session.checkin_at, session.office_location_timezone || tz);
      const existing = byDay.get(dateKey) ?? [];
      existing.push(session);
      byDay.set(dateKey, existing);
    }
    for (const collection of byDay.values()) {
      collection.sort((a, b) => Date.parse(a.checkin_at) - Date.parse(b.checkin_at));
    }
    return byDay;
  }, [filteredSessions, tz]);

  const monthGrid = useMemo(() => {
    if (view !== "month") return { days: [] as Array<string | null>, monthStart: startDate };
    const monthStart = startDate;
    const first = parseDateUtc(monthStart);
    const leading = first.getUTCDay();
    const cells: Array<string | null> = [];
    for (let index = 0; index < leading; index += 1) cells.push(null);

    const nextMonth = parseDateUtc(endDate);
    const dayCount = Math.round((nextMonth.getTime() - first.getTime()) / (24 * 60 * 60 * 1000));
    for (let index = 0; index < dayCount; index += 1) {
      cells.push(addDaysDateOnly(monthStart, index) ?? monthStart);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return { days: cells, monthStart };
  }, [endDate, startDate, view]);

  const selectedCell =
    model.rows.flatMap((row) => row.cells).find((cell) => cell.key === selectedCellKey) ?? null;
  const selectedShift =
    selectedCell?.shifts.find((shift) => shift.id === selectedShiftId) ?? selectedCell?.primaryShift ?? null;
  const cellByUserDate = useMemo(
    () =>
      new Map(
        model.rows.flatMap((row) =>
          row.cells.map((cell) => [`${cell.userId}:${cell.date}`, cell]),
        ),
      ),
    [model.rows],
  );


  const weekDayTiles = useMemo(() => {
    if (view !== "week") return [] as Array<{ date: string; isToday: boolean }>;
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysDateOnly(weekStart, i) ?? weekStart;
      return { date, isToday: date === today };
    });
  }, [view, weekStart, today]);

  const selectedDaySessions = useMemo(
    () => sessionsByDay.get(selectedDay) ?? [],
    [sessionsByDay, selectedDay],
  );

  const formattedRange = useMemo(() => {
    if (view === "day") {
      return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
        .format(new Date(`${anchorDate}T12:00:00Z`));
    }
    if (view === "week") {
      const start = startOfWeekMondayDateOnly(anchorDate) ?? anchorDate;
      const end = addDaysDateOnly(start, 6) ?? start;
      const s = new Date(`${start}T12:00:00Z`);
      const e = new Date(`${end}T12:00:00Z`);
      const sMonth = s.toLocaleDateString(undefined, { month: "short" });
      const eMonth = e.toLocaleDateString(undefined, { month: "short" });
      const sDay = s.getUTCDate();
      const eDay = e.getUTCDate();
      const year = e.getUTCFullYear();
      return sMonth === eMonth
        ? `${sMonth} ${sDay} – ${eDay}, ${year}`
        : `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${year}`;
    }
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
      .format(new Date(`${startOfMonth(anchorDate)}T12:00:00Z`));
  }, [anchorDate, view]);

  useEffect(() => {
    if (!initialComposeOpen) return;
    setDrawerMode("create");
    setDrawerOpen(true);
  }, [initialComposeOpen]);

  useEffect(() => {
    if (!selectedCellKey) return;
    const exists = model.rows.some((row) => row.cells.some((cell) => cell.key === selectedCellKey));
    if (!exists && drawerMode === "detail") {
      setDrawerOpen(false);
      setSelectedCellKey("");
      setSelectedShiftId("");
    }
  }, [drawerMode, model.rows, selectedCellKey]);

  const openCreateDrawer = useCallback(
    (date: string, userId?: string) => {
      setDrawerMode("create");
      setSelectedCellKey("");
      setSelectedShiftId("");
      setDraftDate(date);
      setNotice("");
      setError("");
      setForm(
        defaultForm({
          date,
          initialUserId: userId || selectedUserId || initialUsers[0]?.id || "",
          initialLocationId: initialLocations[0]?.id || "",
        }),
      );
      setDrawerOpen(true);
    },
    [initialLocations, initialUsers, selectedUserId],
  );

  const openCellDrawer = useCallback(
    (cell: SessionCell, shiftId?: string) => {
      setDrawerMode("detail");
      setSelectedCellKey(cell.key);
      setSelectedShiftId(shiftId ?? cell.primaryShift?.id ?? "");
      setDraftDate(cell.date);
      setNotice("");
      setError("");
      setForm(
        prefillFormFromCell({
          cell,
          shift: cell.shifts.find((shift) => shift.id === (shiftId ?? cell.primaryShift?.id)) ?? cell.primaryShift,
          initialLocationId: initialLocations[0]?.id || "",
        }),
      );
      setDrawerOpen(true);
    },
    [initialLocations],
  );

  const openSessionCell = useCallback(
    (session: OfficeHourAdminSession) => {
      const date = formatDateKeyInTz(session.checkin_at, session.office_location_timezone || tz);
      const cell = cellByUserDate.get(`${session.user_id}:${date}`);
      if (!cell) return;
      openCellDrawer(cell);
    },
    [cellByUserDate, openCellDrawer, tz],
  );

  async function reloadWorkspace() {
    await loadWorkspace();
  }

  async function submitShift() {
    const startsAt = parseLocalDateTimeInput(form.startsAt);
    const endsAt = parseLocalDateTimeInput(form.endsAt);
    if (!form.userId || !form.officeLocationId || !startsAt || !endsAt) {
      setError("Choose a member, location, and valid start/end times.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      if (selectedShift) {
        await sendJson(`/api/admin/office-hours/shifts/${selectedShift.id}`, "PATCH", {
          officeLocationId: form.officeLocationId,
          startsAt,
          endsAt,
        });
        setNotice("Shift updated.");
      } else {
        await sendJson("/api/admin/office-hours/shifts", "POST", {
          userId: form.userId,
          officeLocationId: form.officeLocationId,
          startsAt,
          endsAt,
        });
        setNotice("Shift created.");
      }

      await reloadWorkspace();
      setDrawerOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to save shift.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelShift() {
    if (!selectedShift) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await sendJson(`/api/admin/office-hours/shifts/${selectedShift.id}/cancel`, "POST");
      setNotice("Shift cancelled.");
      await reloadWorkspace();
      setDrawerOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to cancel shift.");
    } finally {
      setSubmitting(false);
    }
  }

  async function openSelfie(session: OfficeHourAdminSession) {
    if (!session.has_kiosk_selfie) return;
    setSelfieSession(session);
    setSelfieUrl("");
    setSelfieError("");
    setSelfieLoading(true);
    try {
      const params = new URLSearchParams({ sessionId: session.id });
      const data = await fetchJson<{ url: string; expiresInSeconds: number }>(`/api/office-hours/kiosk/review/photo?${params.toString()}`);
      setSelfieUrl(data.url);
    } catch (nextError) {
      setSelfieError(nextError instanceof Error ? nextError.message : "Failed to load selfie.");
    } finally {
      setSelfieLoading(false);
    }
  }

  function openAdminOverride(session: OfficeHourAdminSession) {
    setOverrideSession(session);
    setOverrideOpen(true);
    setOverrideExclude(false);
    setOverrideReason("");
    setOverrideMessage("");
    setOverrideMessageKind("");
    setOverrideCheckoutLocal(buildLocalDateTimeInput(new Date().toISOString()));
  }

  const closeAdminOverride = useCallback(() => {
    setOverrideOpen(false);
    setOverrideSession(null);
    setOverrideReason("");
    setOverrideMessage("");
    setOverrideMessageKind("");
    setOverrideExclude(false);
    setOverrideCheckoutLocal("");
  }, []);

  useEffect(() => {
    if (!overrideOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeAdminOverride();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overrideOpen, closeAdminOverride]);

  async function submitAdminOverride() {
    if (!overrideSession) return;
    const checkoutAtIso = parseLocalDateTimeInput(overrideCheckoutLocal);
    if (!checkoutAtIso) {
      setOverrideMessage("Choose a valid checkout time.");
      setOverrideMessageKind("error");
      return;
    }

    const validation = validateAdminCheckoutAt({
      checkinAtIso: overrideSession.checkin_at,
      checkoutAtIso,
      nowIso: new Date().toISOString(),
    });
    if (!validation.ok) {
      setOverrideMessage("Checkout time must be between check-in and now.");
      setOverrideMessageKind("error");
      return;
    }

    if (overrideReason.trim().length < 2) {
      setOverrideMessage("Please provide a short reason.");
      setOverrideMessageKind("error");
      return;
    }

    setOverrideSubmitting(true);
    setOverrideMessage("");
    setOverrideMessageKind("");

    try {
      const data = await sendJson<{
        ok: true;
        session: OfficeHourAdminSession;
        notify_error?: string;
      }>("/api/admin/office-hours/close-session", "POST", {
        sessionId: overrideSession.id,
        checkoutAt: checkoutAtIso,
        excludeFromTotals: overrideExclude,
        reason: overrideReason.trim(),
      });

      const updated = {
        ...data.session,
        duration_minutes: computeDurationMinutes(data.session.checkin_at, data.session.checkout_at),
      };

      setSessions((current) => current.map((session) => (session.id === updated.id ? updated : session)));
      setOverrideSession(updated);
      if (data.notify_error) {
        setOverrideMessage(`Updated (email failed: ${data.notify_error})`);
        setOverrideMessageKind("warning");
      } else {
        setOverrideMessage("Session updated.");
        setOverrideMessageKind("success");
      }
    } catch (nextError) {
      setOverrideMessage(nextError instanceof Error ? nextError.message : "Failed to update session.");
      setOverrideMessageKind("error");
    } finally {
      setOverrideSubmitting(false);
    }
  }

  function onPrev() {
    if (view === "day") setAnchorDate((current) => addDaysDateOnly(current, -1) ?? current);
    else if (view === "week") {
      const newAnchor = addDaysDateOnly(anchorDate, -7) ?? anchorDate;
      setAnchorDate(newAnchor);
      setSelectedDay(startOfWeekMondayDateOnly(newAnchor) ?? newAnchor);
    } else setAnchorDate((current) => addDaysDateOnly(startOfMonth(current), -1) ?? current);
  }

  function onNext() {
    if (view === "day") setAnchorDate((current) => addDaysDateOnly(current, 1) ?? current);
    else if (view === "week") {
      const newAnchor = addDaysDateOnly(anchorDate, 7) ?? anchorDate;
      setAnchorDate(newAnchor);
      setSelectedDay(startOfWeekMondayDateOnly(newAnchor) ?? newAnchor);
    } else setAnchorDate((current) => startOfNextMonth(current));
  }

  const overrideCheckoutIso = overrideCheckoutLocal ? parseLocalDateTimeInput(overrideCheckoutLocal) : null;
  const overrideMinLocal = overrideSession ? buildLocalDateTimeInput(overrideSession.checkin_at) : "";
  const overrideMaxLocal = buildLocalDateTimeInput(new Date().toISOString());
  const overrideValidation =
    overrideSession && overrideCheckoutIso
      ? validateAdminCheckoutAt({
          checkinAtIso: overrideSession.checkin_at,
          checkoutAtIso: overrideCheckoutIso,
          nowIso: new Date().toISOString(),
        })
      : { ok: false };
  const overridePreviewMinutes =
    overrideSession && overrideCheckoutIso ? computeAdminOverrideMinutes(overrideSession.checkin_at, overrideCheckoutIso) : null;
  const overrideCanSubmit =
    !!overrideSession && !!overrideCheckoutIso && overrideValidation.ok && overrideReason.trim().length >= 2 && !overrideSubmitting;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: date navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrev}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white text-base text-foreground/55 transition hover:border-[var(--admin-border-strong)] hover:text-foreground"
            aria-label="Previous"
          >
            ‹
          </button>
          <span className="px-1.5 text-sm font-medium text-foreground">{formattedRange}</span>
          <button
            type="button"
            onClick={onNext}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white text-base text-foreground/55 transition hover:border-[var(--admin-border-strong)] hover:text-foreground"
            aria-label="Next"
          >
            ›
          </button>
          {anchorDate !== todayDateString() && (
            <button
              type="button"
              onClick={() => setAnchorDate(todayDateString())}
              className="ml-1 text-xs font-medium text-primary hover:underline"
            >
              Today
            </button>
          )}
        </div>
        {/* Right: controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-xl border border-[var(--admin-border-soft)] bg-white px-2.5 text-xs text-foreground"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            <option value="">All members</option>
            {initialUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.display_name?.trim() || user.email?.trim() || user.id}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-0.5 rounded-full border border-[var(--admin-border-soft)] bg-white p-0.5">
            {(["week", "day", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium capitalize transition",
                  view === mode ? "bg-foreground text-background" : "text-foreground/60 hover:bg-foreground/5",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((current) => !current)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
              filtersOpen
                ? "border-foreground/20 bg-foreground text-background"
                : "border-[var(--admin-border-soft)] bg-white text-foreground/65 hover:border-[var(--admin-border-strong)] hover:text-foreground",
            )}
          >
            Filters
          </button>
          <Button size="sm" onClick={() => openCreateDrawer(anchorDate)} className="h-8 rounded-full px-3 text-xs">
            + Add shift
          </Button>
        </div>
      </div>

      {filtersOpen ? (
        <div className="rounded-2xl border border-[var(--admin-border-soft)] bg-[var(--admin-surface-muted)] px-4 py-3">
          <div className="flex flex-wrap gap-4">
            <label className="min-w-[12rem] flex-1 text-sm">
              <div className="mb-1 text-xs text-foreground/50">Search</div>
              <input
                className="h-9 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, email, location…"
              />
            </label>
            <div className="text-sm">
              <div className="mb-1 text-xs text-foreground/50">Session status</div>
              <div className="flex flex-wrap gap-3 rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 py-2">
                {Object.keys(statusFilter).map((status) => (
                  <label key={status} className="flex items-center gap-1.5 text-xs text-foreground/65">
                    <input
                      type="checkbox"
                      checked={statusFilter[status]}
                      onChange={(event) => setStatusFilter((current) => ({ ...current, [status]: event.target.checked }))}
                    />
                    <span className="font-mono">{status}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-[1.35rem] border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      ) : null}
      {error ? (
        <div className="rounded-[1.35rem] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {view === "week" ? (
        <>
          {/* 7-day strip */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {weekDayTiles.map((tile) => {
              const count = (sessionsByDay.get(tile.date) ?? []).length;
              const isSelected = selectedDay === tile.date;
              return (
                <button
                  key={tile.date}
                  type="button"
                  onClick={() => setSelectedDay(tile.date)}
                  className={cn(
                    "flex min-w-[4.5rem] flex-1 flex-col items-center rounded-2xl border px-2.5 py-3 transition",
                    isSelected
                      ? "border-foreground/25 bg-foreground text-background"
                      : tile.isToday
                        ? "border-emerald-200 bg-emerald-50/60 text-foreground"
                        : "border-[var(--admin-border-soft)] bg-white text-foreground/60 hover:border-[var(--admin-border-strong)] hover:text-foreground",
                  )}
                >
                  <div className="text-[0.65rem] font-semibold uppercase tracking-wider">
                    {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${tile.date}T12:00:00Z`))}
                  </div>
                  <div className="mt-0.5 text-base font-bold leading-none">
                    {parseInt(tile.date.slice(-2), 10)}
                  </div>
                  <div className={cn(
                    "mt-2 text-[0.7rem] font-medium",
                    isSelected ? "text-background/70" : count > 0 ? "text-foreground/70" : "text-foreground/25",
                  )}>
                    {loading ? "·" : count > 0 ? count : "—"}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Day session list */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">
                {loading ? (
                  <span className="text-foreground/40">Loading…</span>
                ) : (
                  <>
                    {formatDateHeading(selectedDay, tz)}
                    <span className="ml-2 text-xs font-normal text-foreground/45">
                      {selectedDaySessions.length} session{selectedDaySessions.length !== 1 ? "s" : ""}
                    </span>
                  </>
                )}
              </div>
              <Button size="sm" onClick={() => openCreateDrawer(selectedDay)} className="h-8 rounded-full px-3 text-xs">
                + Add shift
              </Button>
            </div>

            {loading ? null : selectedDaySessions.length === 0 ? (
              <AdminEmptyState
                title="No sessions"
                description="No sessions logged for this day. Try a different day or broaden the filters."
              />
            ) : (
              <div className="overflow-hidden rounded-[1.35rem] border border-[var(--admin-border-soft)] bg-white">
                {selectedDaySessions.map((session) => {
                  const statusDot =
                    session.status === "open"
                      ? { dot: "bg-emerald-500", label: "Open" }
                      : session.status === "voided"
                        ? { dot: "bg-rose-400", label: "Voided" }
                        : session.status === "auto_closed"
                          ? { dot: "bg-slate-300", label: "Auto-closed" }
                          : { dot: "bg-slate-400", label: "Done" };
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => openSessionCell(session)}
                      className="flex w-full items-center gap-3 border-b border-[var(--admin-border-soft)] px-4 py-3 text-left last:border-0 transition hover:bg-foreground/[0.02]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {session.user_display_name || session.user_email || "Member"}
                        </div>
                        <div className="mt-0.5 text-xs text-foreground/45">
                          {formatTimeInTz(session.checkin_at, tz)}
                          {" – "}
                          {session.checkout_at ? formatTimeInTz(session.checkout_at, tz) : "open"}
                          {typeof session.duration_minutes === "number" && ` · ${formatMinutes(session.duration_minutes)}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", statusDot.dot)} />
                        <span className="text-xs text-foreground/45">{statusDot.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Weekly performance disclosure */}
          {!loading && model.performanceRows.length > 0 && (
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setPerfOpen((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-foreground/55 transition hover:text-foreground"
              >
                <span className={cn("inline-block text-xs transition-transform duration-200", perfOpen && "rotate-180")}>▾</span>
                Weekly Performance
              </button>
              {perfOpen && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b text-left text-[0.72rem] uppercase tracking-[0.18em] text-[var(--admin-label)]">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Member</th>
                        <th className="px-3 py-2.5 font-semibold">Role</th>
                        <th className="px-3 py-2.5 font-semibold">Hours</th>
                        <th className="px-3 py-2.5 font-semibold">Review</th>
                        <th className="px-3 py-2.5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--admin-border-soft)]">
                      {model.performanceRows.map((row) => (
                        <tr key={row.user_id}>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-foreground">{row.name || row.email || "Member"}</div>
                            <div className="text-xs text-foreground/50">{Math.round(Math.max(0, Math.min(1, row.completion)) * 100)}%</div>
                          </td>
                          <td className="px-3 py-2.5 text-foreground/65">{row.role}</td>
                          <td className="px-3 py-2.5 text-foreground/65">
                            {formatHours(row.total_hours)} / {formatHours(row.required_hours)}
                          </td>
                          <td className="px-3 py-2.5 text-foreground/65">{row.needs_review_sessions}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-2">
                              <span className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]", performanceClasses(row.statusKey))}>
                                {hoursStatusLabel({ statusKey: row.statusKey, memberStatus: row.member_status })}
                              </span>
                              <span className={cn("rounded-full px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]", rosterClasses(row.member_status))}>
                                {rosterStatusLabel(row.member_status)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}

      {view === "day" ? (
        <AdminSurface title="Day view" description={`${formatDateHeading(startDate, tz)} • ${filteredSessions.length} session${filteredSessions.length === 1 ? "" : "s"}`}>
          <div className="space-y-3 md:hidden">
            {filteredSessions.length === 0 ? (
              <AdminEmptyState title="No sessions for this day" description="Try another date or broaden the current filters." />
            ) : (
              filteredSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  tz={tz}
                  showUser
                  onViewSelfie={(nextSession) => void openSelfie(nextSession)}
                  onAdminOverride={(nextSession) => openAdminOverride(nextSession)}
                />
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-t bg-foreground/5 text-left text-xs text-foreground/70">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Auth</th>
                  <th className="px-3 py-2">Check-in</th>
                  <th className="px-3 py-2">Check-out</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Selfie</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {session.user_is_allowlisted === false ? "Hidden user" : session.user_display_name || "—"}
                      </div>
                      <div className="text-xs text-foreground/60">
                        {session.user_is_allowlisted === false ? "Not allowlisted" : session.user_email || session.user_id}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{formatAuthMethodLabel(session.kiosk_auth_method)}</div>
                      <div className="text-xs text-foreground/60">{formatMaskedPhone(session.kiosk_auth_method, session.kiosk_phone_last4) || "—"}</div>
                    </td>
                    <td className="px-3 py-2 font-mono">{formatTimeInTz(session.checkin_at, tz)}</td>
                    <td className="px-3 py-2 font-mono">{session.checkout_at ? formatTimeInTz(session.checkout_at, tz) : "—"}</td>
                    <td className="px-3 py-2">{typeof session.duration_minutes === "number" ? formatMinutes(session.duration_minutes) : "—"}</td>
                    <td className="px-3 py-2">
                      {session.has_kiosk_selfie ? (
                        <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => void openSelfie(session)}>
                          View
                        </Button>
                      ) : (
                        <span className="text-xs text-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="px-3 py-2">
                      {session.status === "open" && !session.checkout_at ? (
                        <button
                          type="button"
                          className="rounded-full border border-foreground/15 bg-background px-3 py-1 text-[11px] font-medium text-foreground/80 shadow-sm transition hover:bg-foreground/5"
                          onClick={() => openAdminOverride(session)}
                        >
                          Admin actions
                        </button>
                      ) : session.admin_closed_by ? (
                        <div className="flex flex-col gap-1 text-[10px] text-foreground/70">
                          <span className="inline-flex w-fit items-center rounded-full bg-foreground/10 px-2 py-0.5 font-medium">Admin-closed</span>
                          {session.admin_exclude_from_totals ? (
                            <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Excluded</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{session.office_location_name || "—"}</td>
                  </tr>
                ))}
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-foreground/60" colSpan={9}>
                      No sessions found for this day.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AdminSurface>
      ) : null}

      {view === "month" ? (
        <AdminSurface title="Month view" description="Use the month grid to find active days quickly, then jump into Day view for the actual session detail.">
          <div className="border-b px-3 py-2 text-sm text-foreground/70">Month starting {monthGrid.monthStart}</div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
              <div key={label} className="bg-background px-2 py-2 text-xs font-medium text-foreground/70">
                {label}
              </div>
            ))}
            {monthGrid.days.map((day, index) => {
              if (!day) {
                return <div key={`empty-${index}`} className="bg-background px-2 py-6" />;
              }
              const daySessions = sessionsByDay.get(day) ?? [];
              const dayMinutes = daySessions.reduce(
                (sum, session) => sum + (typeof session.duration_minutes === "number" ? session.duration_minutes : 0),
                0,
              );
              return (
                <button
                  key={day}
                  type="button"
                  className="min-h-24 bg-background px-2 py-2 text-left hover:bg-foreground/5"
                  onClick={() => {
                    setView("day");
                    setAnchorDate(day);
                  }}
                >
                  <div className="text-xs font-medium">{day.slice(-2)}</div>
                  {daySessions.length > 0 ? (
                    <div className="mt-1 text-xs text-foreground/70">
                      {daySessions.length} • {formatMinutes(dayMinutes)}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-foreground/50">—</div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 text-xs text-foreground/60">Click a day to jump into the day view.</div>
        </AdminSurface>
      ) : null}

      <AdminDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={drawerMode === "create" ? "Add Office Hours shift" : selectedCell?.userDisplayName || selectedCell?.userEmail || "Office Hours details"}
        description={
          drawerMode === "create"
            ? "Create the shift directly from the week board. This is the only scheduling surface."
            : selectedCell?.hasShift
              ? "Shift details stay tied to the member-day cell, with a direct path into the related session work."
              : "This member-day cell has session activity without a scheduled shift."
        }
      >
        <div className="space-y-5">
          {drawerMode === "detail" && selectedCell ? (
            <div className="space-y-4 rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-[var(--admin-surface-muted)] p-4">
              <div>
                <div className="text-base font-semibold text-foreground">{selectedCell.userDisplayName || selectedCell.userEmail || "Member"}</div>
                <div className="text-sm text-foreground/62">{selectedCell.userEmail || "No email on file"}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Date", value: formatDateHeading(selectedCell.date, tz) },
                  { label: "Location", value: selectedShift?.office_location_name || selectedCell.sessions[0]?.office_location_name || "Office" },
                  { label: "Shift", value: selectedShift ? shiftStatusLabel(selectedShift.status) : "No scheduled shift" },
                  { label: "Sessions", value: `${selectedCell.sessions.length} logged` },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1rem] border border-[var(--admin-border-soft)] bg-white px-3 py-3">
                    <div className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--admin-label)]">{item.label}</div>
                    <div className="mt-2 text-sm font-semibold text-foreground">{item.value}</div>
                  </div>
                ))}
              </div>
              {selectedCell.shifts.length > 1 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-label)]">Select shift</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedCell.shifts.map((shift) => (
                      <button
                        key={shift.id}
                        type="button"
                        onClick={() => {
                          setSelectedShiftId(shift.id);
                          setForm(
                            prefillFormFromCell({
                              cell: selectedCell,
                              shift,
                              initialLocationId: initialLocations[0]?.id || "",
                            }),
                          );
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                          selectedShift?.id === shift.id
                            ? "border-foreground/20 bg-white text-foreground"
                            : "border-[var(--admin-border-soft)] bg-white text-foreground/70 hover:border-[var(--admin-border-strong)] hover:text-foreground",
                        )}
                      >
                        {formatTimeRange(shift.starts_at, shift.ends_at, shift.office_location_timezone || tz)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {selectedShift ? (
                  <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", shiftStatusClasses(selectedShift.status))}>
                    {shiftStatusLabel(selectedShift.status)}
                  </span>
                ) : null}
                {coverageLabel(selectedCell.coverageState) ? (
                  <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", coverageClasses(selectedCell.coverageState))}>
                    {coverageLabel(selectedCell.coverageState)}
                  </span>
                ) : null}
                {sessionStateLabel(selectedCell.sessionState) ? (
                  <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", sessionStateClasses(selectedCell.sessionState))}>
                    {sessionStateLabel(selectedCell.sessionState)}
                  </span>
                ) : null}
                {selectedCell.isUnscheduledSession ? (
                  <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-sky-700">
                    Unscheduled session
                  </span>
                ) : null}
                <Link
                  href={buildDayHref(selectedCell.userId, selectedCell.date)}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-3 text-xs font-medium text-foreground/80"
                >
                  Open day
                </Link>
              </div>
            </div>
          ) : null}

          {drawerMode === "detail" && selectedCell?.sessions.length ? (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-label)]">Session activity</div>
              <div className="space-y-2">
                {selectedCell.sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    tz={tz}
                    onViewSelfie={(nextSession) => void openSelfie(nextSession)}
                    onAdminOverride={(nextSession) => openAdminOverride(nextSession)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Member</div>
            <select
              className="h-11 w-full rounded-xl border bg-white px-3 text-sm"
              value={form.userId}
              onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
              disabled={!!selectedShift}
            >
              {initialUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name?.trim() || user.email?.trim() || user.id}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Office location</div>
            <select
              className="h-11 w-full rounded-xl border bg-white px-3 text-sm"
              value={form.officeLocationId}
              onChange={(event) => setForm((current) => ({ ...current, officeLocationId: event.target.value }))}
              disabled={!!selectedShift && !getOfficeHourShiftActionState(selectedShift, nowIso).canEdit}
            >
              {initialLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Starts at</div>
            <input
              type="datetime-local"
              className="h-11 w-full rounded-xl border bg-white px-3 text-sm"
              value={form.startsAt}
              onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
              disabled={!!selectedShift && !getOfficeHourShiftActionState(selectedShift, nowIso).canEdit}
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Ends at</div>
            <input
              type="datetime-local"
              className="h-11 w-full rounded-xl border bg-white px-3 text-sm"
              value={form.endsAt}
              onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
              disabled={!!selectedShift && !getOfficeHourShiftActionState(selectedShift, nowIso).canEdit}
            />
          </label>

          {selectedShift && !getOfficeHourShiftActionState(selectedShift, nowIso).canEdit ? (
            <div className="text-sm text-foreground/58">
              This shift is historical. It stays visible for context, but only future scheduled shifts can be changed.
            </div>
          ) : null}

          {!selectedShift && drawerMode === "detail" ? (
            <div className="rounded-[1.2rem] border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm text-sky-900">
              No scheduled shift exists for this member-day cell. You can create one here if the session should have been scheduled.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void submitShift()}
              disabled={submitting || (!!selectedShift && !getOfficeHourShiftActionState(selectedShift, nowIso).canEdit)}
            >
              {selectedShift ? "Save changes" : "Create shift"}
            </Button>
            {selectedShift ? (
              <Button
                variant="outline"
                className="border-rose-200 text-rose-700 hover:bg-rose-50"
                onClick={() => void cancelShift()}
                disabled={submitting || !getOfficeHourShiftActionState(selectedShift, nowIso).canCancel}
              >
                Cancel shift
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={submitting}>
              Close
            </Button>
          </div>
        </div>
      </AdminDrawer>

      {overrideSession ? (
        <AdminDrawer
          open={overrideOpen}
          onOpenChange={(open) => {
            if (!open) closeAdminOverride();
          }}
          title="Close open session"
          description="Record the corrected checkout time, explain why the change is needed, and decide whether the session should count toward totals."
        >
          <div className="space-y-5 text-sm">
            <div className="rounded-2xl border bg-foreground/[0.02] p-4 shadow-sm">
              <div className="text-sm font-semibold">{overrideSession.user_display_name || "Member"}</div>
              <div className="text-xs text-foreground/60">{overrideSession.user_email || overrideSession.user_id}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-foreground/65">
                <span>{formatAuthMethodLabel(overrideSession.kiosk_auth_method)}</span>
                {overrideSession.kiosk_phone_last4 ? <span>{formatMaskedPhone(overrideSession.kiosk_auth_method, overrideSession.kiosk_phone_last4)}</span> : null}
              </div>
              <div className="mt-2 text-xs text-foreground/70">
                Check-in: {formatTimeInTz(overrideSession.checkin_at, tz)} • {formatDateHeading(overrideSession.checkin_at.slice(0, 10), tz)}
              </div>
            </div>

            <label className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-foreground/60">Checkout time</div>
              <input
                type="datetime-local"
                min={overrideMinLocal}
                max={overrideMaxLocal}
                value={overrideCheckoutLocal}
                onChange={(event) => setOverrideCheckoutLocal(event.target.value)}
                className="h-11 w-full rounded-xl border bg-transparent px-3 text-sm shadow-sm"
              />
              <div className="text-xs text-foreground/60">Must be between check-in and now.</div>
            </label>

            <label className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-foreground/60">Reason (required)</div>
              <textarea
                rows={3}
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                className="w-full rounded-xl border bg-transparent px-3 py-2 text-sm shadow-sm"
                placeholder="Short reason for the change"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-3 shadow-sm">
              <div>
                <div className="text-sm font-medium">Count hours</div>
                <div className="text-xs text-foreground/60">Include this session in weekly totals.</div>
              </div>
              <input type="checkbox" checked={!overrideExclude} onChange={(event) => setOverrideExclude(!event.target.checked)} className="h-4 w-4" />
            </label>

            <div className="rounded-xl border bg-foreground/[0.02] p-3 text-xs text-foreground/70">
              {overridePreviewMinutes !== null ? (
                <div>
                  Estimated duration: <span className="font-semibold">{formatMinutes(overridePreviewMinutes)}</span>
                </div>
              ) : (
                <div>Estimated duration will appear once a valid time is set.</div>
              )}
              <div className="mt-1">
                This change will <span className="font-medium">{overrideExclude ? "exclude" : "count"}</span> toward totals.
              </div>
            </div>

            {overrideMessage ? (
              <div
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs",
                  overrideMessageKind === "error" && "border-red-500/30 bg-red-500/5 text-red-700",
                  overrideMessageKind === "warning" && "border-amber-500/30 bg-amber-500/5 text-amber-800",
                  (overrideMessageKind === "success" || overrideMessageKind === "") && "border-emerald-500/30 bg-emerald-500/5 text-emerald-700",
                )}
              >
                {overrideMessage}
              </div>
            ) : null}

            <div className="space-y-2">
              <Button onClick={() => void submitAdminOverride()} disabled={!overrideCanSubmit} className="h-11 w-full rounded-xl">
                {overrideSubmitting ? "Updating…" : "Confirm update"}
              </Button>
              <Button variant="ghost" onClick={closeAdminOverride} className="h-10 w-full">
                Cancel
              </Button>
              <div className="text-xs text-foreground/60">The member will be notified by email. Changes are audit-logged.</div>
            </div>
          </div>
        </AdminDrawer>
      ) : null}

      <SelfieLightbox
        open={!!selfieSession}
        session={selfieSession}
        tz={tz}
        url={selfieUrl}
        loading={selfieLoading}
        error={selfieError}
        onClose={() => {
          setSelfieSession(null);
          setSelfieUrl("");
          setSelfieError("");
          setSelfieLoading(false);
        }}
        onRetry={() => {
          if (selfieSession) void openSelfie(selfieSession);
        }}
      />
    </div>
  );
}

function SessionCard({
  session,
  tz,
  showUser,
  onViewSelfie,
  onAdminOverride,
}: {
  session: OfficeHourAdminSession;
  tz: string | null;
  showUser?: boolean;
  onViewSelfie?: (session: OfficeHourAdminSession) => void;
  onAdminOverride?: (session: OfficeHourAdminSession) => void;
}) {
  return (
    <div className="rounded-[1rem] border border-[var(--admin-border-soft)] bg-white p-3 text-xs shadow-sm">
      {showUser ? (
        <div className="mb-1.5 border-b pb-1 font-medium">
          {session.user_is_allowlisted === false ? "Hidden user" : session.user_display_name || session.user_email || session.user_id}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-muted-foreground whitespace-nowrap">
          {formatTimeInTz(session.checkin_at, tz)}
          <span className="mx-1 text-muted-foreground/40">→</span>
          {session.checkout_at ? formatTimeInTz(session.checkout_at, tz) : "—"}
        </div>
        <StatusBadge status={session.status} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-muted-foreground">
        <div className="font-medium">{typeof session.duration_minutes === "number" ? formatMinutes(session.duration_minutes) : "—"}</div>
        <div className="flex items-center gap-1.5">
          {session.has_kiosk_selfie && onViewSelfie ? (
            <button
              type="button"
              className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-medium text-foreground/70 hover:bg-foreground/15"
              onClick={() => onViewSelfie(session)}
            >
              Selfie
            </button>
          ) : null}
          {session.within_radius === false ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              Outside
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground/70">{formatAuthMethodLabel(session.kiosk_auth_method)}</span>
        {session.kiosk_phone_last4 ? (
          <span className="rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground/70">
            {formatMaskedPhone(session.kiosk_auth_method, session.kiosk_phone_last4)}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {session.admin_closed_by ? <span className="rounded-full bg-foreground/10 px-2 py-0.5 font-medium text-foreground/70">Admin-closed</span> : null}
          {session.admin_exclude_from_totals ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Excluded</span>
          ) : null}
        </div>
        {session.status === "open" && !session.checkout_at && onAdminOverride ? (
          <button
            type="button"
            className="rounded-full border border-foreground/15 bg-background px-2.5 py-0.5 font-medium text-foreground/80 shadow-sm transition hover:bg-foreground/5"
            onClick={() => onAdminOverride(session)}
          >
            Admin actions
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SelfieLightbox({
  open,
  session,
  tz,
  url,
  loading,
  error,
  onClose,
  onRetry,
}: {
  open: boolean;
  session: OfficeHourAdminSession | null;
  tz: string | null;
  url: string;
  loading: boolean;
  error: string;
  onClose: () => void;
  onRetry: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !session) return null;

  const title = session.user_display_name || session.user_email || "Kiosk selfie";
  const subtitle = `${formatTimeInTz(session.checkin_at, tz)} • session ${session.id.slice(0, 8)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Kiosk selfie"
      onMouseDown={(event) => {
        if (shouldCloseOnBackdrop({ target: event.target, currentTarget: event.currentTarget })) onClose();
      }}
    >
      <div data-backdrop="true" className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative flex w-full max-w-4xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border bg-background/90 shadow-2xl ring-1 ring-black/10 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-start justify-between gap-3 border-b bg-background/80 p-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{title}</div>
            <div className="mt-0.5 text-xs text-foreground/60 truncate">{subtitle}</div>
          </div>
          <div className="flex items-center gap-2">
            {url ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                className="h-8 px-3"
              >
                Open full
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 px-2">
              Close
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border bg-foreground/[0.02] text-sm text-foreground/70">
              Loading selfie…
            </div>
          ) : error ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700">{error}</div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onRetry} className="h-10 px-4">
                  Retry
                </Button>
                <Button type="button" variant="ghost" onClick={onClose} className="h-10 px-4">
                  Cancel
                </Button>
              </div>
            </div>
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt="Kiosk check-in selfie"
              className="w-full max-h-[70vh] rounded-xl border bg-black object-contain shadow-sm cursor-zoom-in"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            />
          ) : (
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border bg-foreground/[0.02] text-sm text-foreground/70">
              No selfie found.
            </div>
          )}

          <div className="mt-3 text-xs text-foreground/60">Selfies are retained for 30 days. Links expire after a few minutes.</div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    open: "bg-green-100 text-green-700",
    closed: "bg-slate-100 text-slate-700",
    auto_closed: "bg-orange-100 text-orange-700",
    voided: "bg-red-100 text-red-700",
  };
  const style = styles[status as keyof typeof styles] || "bg-gray-100 text-gray-700";

  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize", style)}>{status.replace("_", " ")}</span>;
}

function computeDurationMinutes(checkinAtIso: string, checkoutAtIso: string | null): number | null {
  if (!checkoutAtIso) return null;
  const start = Date.parse(checkinAtIso);
  const end = Date.parse(checkoutAtIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(Math.round((end - start) / 60000), 0);
}

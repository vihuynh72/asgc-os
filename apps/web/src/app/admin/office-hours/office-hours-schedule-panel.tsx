"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminDrawer } from "@/components/admin/admin-drawer";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminSurface } from "@/components/admin/admin-surface";
import { AdminToolbar } from "@/components/admin/admin-toolbar";
import { Button } from "@/components/ui/button";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { buildOfficeHoursScheduleWorkspaceModel, getOfficeHourShiftActionState } from "@/lib/office-hours-admin-workspace.mjs";
import { hoursStatusLabel, rosterStatusLabel } from "@/lib/office-hours-weekly-report.mjs";
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

type SessionRow = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  office_location_id: string | null;
  office_location_name: string;
  office_location_timezone: string;
  checkin_at: string;
  checkout_at: string | null;
  status: string;
  duration_minutes: number | null;
};

type PerformanceRow = WeeklyRow & {
  statusKey: "complete" | "missing" | "behind" | "not_required";
  completion: number;
};

type ScheduleShiftView = ShiftRow & {
  coverageState: "cancelled" | "covered" | "coverage_requested" | null;
  sessionState: "checked_in_now" | "completed_today" | "no_session_yet" | null;
  dateKey: string;
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

type ScheduleWorkspaceModel = {
  weekStart: string;
  days: Array<{
    date: string;
    isToday: boolean;
    shifts: ScheduleShiftView[];
    openSessionCount: number;
  }>;
  today: {
    date: string;
    shifts: ScheduleShiftView[];
    openSessions: SessionRow[];
    upcomingShifts: ScheduleShiftView[];
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

function formatDateHeading(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
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

function formatTimeRange(start: string, end: string, timeZone?: string | null): string {
  return `${formatDateTime(start, timeZone)} to ${formatDateTime(end, timeZone)}`;
}

function formatHours(value: number): string {
  return `${Math.round(value * 10) / 10}h`;
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
  return null;
}

function coverageClasses(coverageState: string | null) {
  if (coverageState === "covered") return "bg-sky-500/10 text-sky-700";
  if (coverageState === "coverage_requested") return "bg-amber-500/12 text-amber-700";
  return "";
}

function sessionStateLabel(sessionState: string | null) {
  if (sessionState === "checked_in_now") return "Checked in now";
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

function currentTimeMarkerLabel(nowIso: string, timeZone?: string | null) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone ?? undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(nowIso));
}

function buildSessionsHref(userId: string, date: string) {
  const params = new URLSearchParams({ userId, date, view: "day" });
  return `/admin/office-hours/sessions?${params.toString()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

async function sendJson<T>(url: string, method: "POST" | "PATCH", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function defaultForm({
  weekStart,
  initialUserId,
  initialLocationId,
}: {
  weekStart: string;
  initialUserId: string;
  initialLocationId: string;
}): ShiftFormState {
  return {
    userId: initialUserId,
    officeLocationId: initialLocationId,
    startsAt: `${weekStart}T10:00`,
    endsAt: `${weekStart}T11:00`,
  };
}

export function OfficeHoursSchedulePanel({
  initialUsers,
  initialLocations,
  initialWeekStart,
  initialSelectedUserId,
  initialComposeOpen,
}: {
  initialUsers: UserRow[];
  initialLocations: OfficeLocationRow[];
  initialWeekStart: string;
  initialSelectedUserId: string;
  initialComposeOpen: boolean;
}) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [selectedUserId, setSelectedUserId] = useState(initialSelectedUserId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [weekRows, setWeekRows] = useState<WeeklyRow[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [drawerOpen, setDrawerOpen] = useState(initialComposeOpen);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ShiftFormState>(
    defaultForm({
      weekStart: initialWeekStart,
      initialUserId: initialSelectedUserId || initialUsers[0]?.id || "",
      initialLocationId: initialLocations[0]?.id || "",
    }),
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const weekEnd = addDaysDateOnly(weekStart, 5) ?? weekStart;
        const params = new URLSearchParams({ weekStart });
        if (selectedUserId) params.set("userId", selectedUserId);

        const [shiftData, sessionData, weekly] = await Promise.all([
          fetchJson<{ shifts: ShiftRow[] }>(`/api/admin/office-hours/shifts?${params.toString()}`),
          fetchJson<{ sessions: SessionRow[] }>(
            `/api/admin/office-hours/sessions?startDate=${encodeURIComponent(weekStart)}&endDate=${encodeURIComponent(weekEnd)}${selectedUserId ? `&userId=${encodeURIComponent(selectedUserId)}` : ""}&limit=500`,
          ),
          fetchJson<{ rows: WeeklyRow[] }>(
            `/api/admin/office-hours/export-week?format=json&disposition=inline&weekStart=${encodeURIComponent(weekStart)}`,
          ),
        ]);

        if (cancelled) return;
        setShifts(shiftData.shifts ?? []);
        setSessions(sessionData.sessions ?? []);
        setWeekRows((weekly.rows ?? []).filter((row) => !selectedUserId || row.user_id === selectedUserId));
        setSelectedShiftId((current) => {
          if (current && (shiftData.shifts ?? []).some((shift) => shift.id === current)) return current;
          return "";
        });
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load Office Hours schedule.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, weekStart]);

  useEffect(() => {
    if (!initialComposeOpen) return;
    setDrawerMode("create");
  }, [initialComposeOpen]);

  const nowIso = new Date().toISOString();
  const today = todayDateString();
  const model = useMemo(
    () =>
      buildOfficeHoursScheduleWorkspaceModel({
        weekStart,
        todayDate: today,
        nowIso,
        weekRows,
        shifts,
        sessions,
      }) as ScheduleWorkspaceModel,
    [nowIso, sessions, shifts, today, weekRows, weekStart],
  );

  const selectedShift =
    shifts.find((shift) => shift.id === selectedShiftId) ??
    model.days.flatMap((day) => day.shifts).find((shift) => shift.id === selectedShiftId) ??
    null;
  const selectedShiftView = model.days.flatMap((day) => day.shifts).find((shift) => shift.id === selectedShiftId) ?? null;
  const selectedShiftDate = model.days.find((day) => day.shifts.some((shift) => shift.id === selectedShiftId))?.date ?? weekStart;

  function openCreateDrawer() {
    setDrawerMode("create");
    setSelectedShiftId("");
    setForm(
      defaultForm({
        weekStart,
        initialUserId: selectedUserId || initialUsers[0]?.id || "",
        initialLocationId: initialLocations[0]?.id || "",
      }),
    );
    setDrawerOpen(true);
  }

  function openEditDrawer(shift: ShiftRow) {
    setDrawerMode("edit");
    setSelectedShiftId(shift.id);
    setForm({
      userId: shift.user_id,
      officeLocationId: shift.office_location_id,
      startsAt: buildLocalDateTimeInput(shift.starts_at),
      endsAt: buildLocalDateTimeInput(shift.ends_at),
    });
    setDrawerOpen(true);
  }

  async function reloadShifts() {
    const params = new URLSearchParams({ weekStart });
    if (selectedUserId) params.set("userId", selectedUserId);
    const data = await fetchJson<{ shifts: ShiftRow[] }>(`/api/admin/office-hours/shifts?${params.toString()}`);
    setShifts(data.shifts ?? []);
    return data.shifts ?? [];
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
      if (drawerMode === "create") {
        await sendJson("/api/admin/office-hours/shifts", "POST", {
          userId: form.userId,
          officeLocationId: form.officeLocationId,
          startsAt,
          endsAt,
        });
        setNotice("Shift created.");
      } else if (selectedShift) {
        await sendJson(`/api/admin/office-hours/shifts/${selectedShift.id}`, "PATCH", {
          officeLocationId: form.officeLocationId,
          startsAt,
          endsAt,
        });
        setNotice("Shift updated.");
      }

      await reloadShifts();
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
      await reloadShifts();
      setDrawerOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to cancel shift.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminToolbar
        primary={
          <>
            <Button variant="outline" onClick={() => setWeekStart(addDaysDateOnly(weekStart, -7) ?? weekStart)}>
              Prev week
            </Button>
            <Button variant="outline" onClick={() => setWeekStart(startOfWeekMondayDateOnly(today) ?? today)}>
              Current week
            </Button>
            <Button variant="outline" onClick={() => setWeekStart(addDaysDateOnly(weekStart, 7) ?? weekStart)}>
              Next week
            </Button>
          </>
        }
        secondary={<Button onClick={openCreateDrawer}>Add shift</Button>}
      >
        <label className="space-y-1 text-sm">
          <div className="text-foreground/62">Week of</div>
          <input
            type="date"
            className="h-10 rounded-xl border bg-white px-3 text-sm"
            value={weekStart}
            onChange={(event) => setWeekStart(startOfWeekMondayDateOnly(normalizeDateOnlyString(event.target.value) ?? weekStart) ?? weekStart)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <div className="text-foreground/62">Member</div>
          <select
            className="h-10 min-w-[15rem] rounded-xl border bg-white px-3 text-sm"
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
        </label>
      </AdminToolbar>

      {notice ? (
        <div className="rounded-[1.35rem] border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      ) : null}
      {error ? (
        <div className="rounded-[1.35rem] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.85fr)]">
        <AdminSurface
          title="Week schedule"
          description="Open straight into the week. Today stays highlighted, and every shift opens into the same edit sheet."
        >
          {loading ? (
            <div className="text-sm text-foreground/62">Loading schedule…</div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-5">
              {model.days.map((day) => (
                <section
                  key={day.date}
                  className={cn(
                    "rounded-[1.45rem] border p-4",
                    day.isToday
                      ? "border-emerald-200 bg-emerald-50/60 shadow-[0_18px_30px_-28px_rgba(15,23,42,0.22)]"
                      : "border-[var(--admin-border-soft)] bg-[var(--admin-surface-muted)]",
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{formatDateHeading(day.date)}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--admin-label)]">
                          {day.shifts.length} shift{day.shifts.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      {day.isToday ? (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-700 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.24)]">
                          Now {currentTimeMarkerLabel(nowIso, day.shifts[0]?.office_location_timezone)}
                        </span>
                      ) : null}
                    </div>

                    {day.shifts.length === 0 ? (
                      <div className="rounded-[1.15rem] border border-dashed border-[var(--admin-border-strong)] bg-white px-3 py-5 text-sm text-foreground/58">
                        No shifts
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {day.shifts.map((shift) => {
                          const active = selectedShiftId === shift.id && drawerOpen;
                          const sessionLabel = sessionStateLabel(shift.sessionState);
                          const coverage = coverageLabel(shift.coverageState);
                          return (
                            <article
                              key={shift.id}
                              className={cn(
                                "rounded-[1.2rem] border bg-white px-3 py-3 shadow-[0_16px_28px_-28px_rgba(15,23,42,0.18)]",
                                active ? "border-foreground/18" : "border-[var(--admin-border-soft)]",
                              )}
                            >
                              <button type="button" onClick={() => openEditDrawer(shift)} className="w-full text-left">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-foreground">
                                      {shift.user_display_name || shift.user_email || "Member"}
                                    </div>
                                    <div className="mt-1 text-sm text-foreground/62">
                                      {formatTimeRange(shift.starts_at, shift.ends_at, shift.office_location_timezone)}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", shiftStatusClasses(shift.status))}>
                                    {shiftStatusLabel(shift.status)}
                                  </span>
                                  {coverage ? (
                                    <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", coverageClasses(shift.coverageState))}>
                                      {coverage}
                                    </span>
                                  ) : null}
                                  {sessionLabel ? (
                                    <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", sessionStateClasses(shift.sessionState))}>
                                      {sessionLabel}
                                    </span>
                                  ) : null}
                                </div>
                              </button>

                              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                                <div className="text-xs text-foreground/54">
                                  {shift.office_location_name || "Office"}
                                </div>
                                <Link
                                  href={buildSessionsHref(shift.user_id, day.date)}
                                  className="text-xs font-medium text-foreground/72 transition hover:text-foreground"
                                >
                                  Sessions
                                </Link>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </AdminSurface>

        <AdminSurface
          title="Today"
          description="Who is on shift today, who is checked in, and what needs attention right now."
          action={
            <Link
              href={`/admin/office-hours/sessions?date=${encodeURIComponent(model.today.date)}&view=day`}
              className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-3 text-xs font-medium text-foreground/80"
            >
              Open sessions
            </Link>
          }
        >
          {loading ? (
            <div className="text-sm text-foreground/62">Loading today…</div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-label)]">On shift today</div>
                {model.today.shifts.length === 0 ? (
                  <div className="rounded-[1.15rem] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] px-4 py-3 text-sm text-foreground/58">
                    No shifts scheduled today.
                  </div>
                ) : (
                  model.today.shifts.map((shift) => (
                    <button
                      key={shift.id}
                      type="button"
                      onClick={() => openEditDrawer(shift)}
                      className="w-full rounded-[1.15rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3 text-left transition hover:border-[var(--admin-border-strong)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{shift.user_display_name || shift.user_email || "Member"}</div>
                          <div className="text-sm text-foreground/62">
                            {formatTimeRange(shift.starts_at, shift.ends_at, shift.office_location_timezone)}
                          </div>
                        </div>
                        {sessionStateLabel(shift.sessionState) ? (
                          <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", sessionStateClasses(shift.sessionState))}>
                            {sessionStateLabel(shift.sessionState)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </section>

              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-label)]">Open sessions now</div>
                {model.today.openSessions.length === 0 ? (
                  <div className="rounded-[1.15rem] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] px-4 py-3 text-sm text-foreground/58">
                    No one is checked in right now.
                  </div>
                ) : (
                  model.today.openSessions.map((session) => (
                    <Link
                      key={session.id}
                      href={buildSessionsHref(session.user_id, model.today.date)}
                      className="block rounded-[1.15rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3 transition hover:border-[var(--admin-border-strong)]"
                    >
                      <div className="text-sm font-semibold text-foreground">{session.user_display_name || session.user_email || "Member"}</div>
                      <div className="text-sm text-foreground/62">
                        {session.office_location_name || "Office"} • checked in {formatDateTime(session.checkin_at, session.office_location_timezone)}
                      </div>
                    </Link>
                  ))
                )}
              </section>

              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-label)]">Upcoming today</div>
                {model.today.upcomingShifts.length === 0 ? (
                  <div className="rounded-[1.15rem] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] px-4 py-3 text-sm text-foreground/58">
                    No later shifts remaining today.
                  </div>
                ) : (
                  model.today.upcomingShifts.map((shift) => (
                    <button
                      key={shift.id}
                      type="button"
                      onClick={() => openEditDrawer(shift)}
                      className="w-full rounded-[1.15rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3 text-left transition hover:border-[var(--admin-border-strong)]"
                    >
                      <div className="text-sm font-semibold text-foreground">{shift.user_display_name || shift.user_email || "Member"}</div>
                      <div className="text-sm text-foreground/62">
                        {formatTimeRange(shift.starts_at, shift.ends_at, shift.office_location_timezone)}
                      </div>
                    </button>
                  ))
                )}
              </section>

              <section className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-label)]">Attention</div>
                {model.today.blockers.length === 0 ? (
                  <div className="rounded-[1.15rem] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] px-4 py-3 text-sm text-foreground/58">
                    Today is clear right now.
                  </div>
                ) : (
                  model.today.blockers.map((blocker) => (
                    <div key={`${blocker.kind}:${blocker.shiftId || blocker.userId}`} className="rounded-[1.15rem] border border-amber-500/15 bg-amber-500/6 px-4 py-3">
                      <div className="text-sm font-medium text-amber-900">{blocker.label}</div>
                    </div>
                  ))
                )}
              </section>
            </div>
          )}
        </AdminSurface>
      </div>

      <AdminSurface
        title="Weekly performance"
        description="Compact weekly progress for the visible members. Use Sessions for deep audit work."
      >
        {loading ? (
          <div className="text-sm text-foreground/62">Loading weekly performance…</div>
        ) : model.performanceRows.length === 0 ? (
          <AdminEmptyState title="No weekly data yet" description="The selected week does not have Office Hours weekly totals yet." />
        ) : (
          <div className="space-y-3">
            {model.performanceRows.slice(0, 8).map((row) => {
              const progress = `${Math.round(Math.max(0, Math.min(1, row.completion)) * 100)}%`;
              return (
                <div key={row.user_id} className="rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-white px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-foreground">{row.name || row.email || "Member"}</div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
                          {row.role}
                        </span>
                        <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", performanceClasses(row.statusKey))}>
                          {hoursStatusLabel({ statusKey: row.statusKey, memberStatus: row.member_status })}
                        </span>
                        <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", rosterClasses(row.member_status))}>
                          {rosterStatusLabel(row.member_status)}
                        </span>
                      </div>
                      <div className="text-sm text-foreground/62">
                        {formatHours(row.total_hours)} completed of {formatHours(row.required_hours)} required
                        {row.needs_review_sessions > 0 ? ` • ${row.needs_review_sessions} review flag${row.needs_review_sessions === 1 ? "" : "s"}` : ""}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-sm font-semibold text-foreground">{progress}</div>
                      <Link
                        href={buildSessionsHref(row.user_id, weekStart)}
                        className="text-xs font-medium text-foreground/72 transition hover:text-foreground"
                      >
                        Sessions
                      </Link>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-2 rounded-full",
                        row.statusKey === "complete"
                          ? "bg-emerald-500"
                          : row.statusKey === "behind"
                            ? "bg-amber-500"
                            : "bg-rose-500",
                      )}
                      style={{ width: progress }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminSurface>

      <AdminDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={drawerMode === "create" ? "Add Office Hours shift" : "Edit Office Hours shift"}
        description={
          drawerMode === "create"
            ? "Create the shift here. Existing shifts stay on the week board and keep their history if cancelled."
            : "Update the shift timing or cancel it here. Historical shifts remain read-only."
        }
      >
        <div className="space-y-5">
          {drawerMode === "edit" && selectedShift ? (
            <div className="space-y-4 rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-[var(--admin-surface-muted)] p-4">
              <div>
                <div className="text-base font-semibold text-foreground">{selectedShift.user_display_name || selectedShift.user_email || "Member"}</div>
                <div className="text-sm text-foreground/62">{selectedShift.user_email || "No email on file"}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Location", value: selectedShift.office_location_name || "Office" },
                  { label: "Shift status", value: shiftStatusLabel(selectedShift.status) },
                  { label: "Starts", value: formatDateTime(selectedShift.starts_at, selectedShift.office_location_timezone) },
                  { label: "Ends", value: formatDateTime(selectedShift.ends_at, selectedShift.office_location_timezone) },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1rem] border border-[var(--admin-border-soft)] bg-white px-3 py-3">
                    <div className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--admin-label)]">{item.label}</div>
                    <div className="mt-2 text-sm font-semibold text-foreground">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", shiftStatusClasses(selectedShift.status))}>
                  {shiftStatusLabel(selectedShift.status)}
                </span>
                {coverageLabel(selectedShiftView?.coverageState ?? null) ? (
                  <span className={cn("rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]", coverageClasses(selectedShiftView?.coverageState ?? null))}>
                    {coverageLabel(selectedShiftView?.coverageState ?? null)}
                  </span>
                ) : null}
                <Link
                  href={buildSessionsHref(
                    selectedShift.user_id,
                    selectedShiftDate,
                  )}
                  className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-3 text-xs font-medium text-foreground/80"
                >
                  Open sessions
                </Link>
              </div>
            </div>
          ) : null}

          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Member</div>
            <select
              className="h-11 w-full rounded-xl border bg-white px-3 text-sm"
              value={form.userId}
              onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))}
              disabled={drawerMode === "edit"}
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
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Ends at</div>
            <input
              type="datetime-local"
              className="h-11 w-full rounded-xl border bg-white px-3 text-sm"
              value={form.endsAt}
              onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
            />
          </label>

          {!selectedShift || getOfficeHourShiftActionState(selectedShift, nowIso).canEdit ? null : (
            <div className="text-sm text-foreground/58">
              This shift is historical. It stays visible here for context, but only future scheduled shifts can be changed.
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => void submitShift()}
              disabled={submitting || (drawerMode === "edit" && selectedShift ? !getOfficeHourShiftActionState(selectedShift, nowIso).canEdit : false)}
            >
              {drawerMode === "create" ? "Create shift" : "Save changes"}
            </Button>
            {drawerMode === "edit" && selectedShift ? (
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
    </div>
  );
}

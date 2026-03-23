"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminDrawer } from "@/components/admin/admin-drawer";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminStatStrip } from "@/components/admin/admin-stat-strip";
import { AdminSurface } from "@/components/admin/admin-surface";
import { AdminToolbar } from "@/components/admin/admin-toolbar";
import type { AdminStat } from "@/components/admin/admin-types";
import { Button } from "@/components/ui/button";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { getOfficeHourShiftActionState } from "@/lib/office-hours-admin-workspace.mjs";

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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function coverageLabel(shift: ShiftRow): string | null {
  if (shift.covered_by_user_id || shift.claimed_coverage_request_count > 0) return "Covered";
  if (shift.open_coverage_request_count > 0) return "Coverage requested";
  return null;
}

function formatDateKeyInTimezone(iso: string, timeZone: string | null): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
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
  const [statusFilter, setStatusFilter] = useState<Record<string, boolean>>({
    scheduled: true,
    cancelled: true,
    completed: false,
    missed: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
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

  const weekDays = useMemo(() => {
    const start = startOfWeekMondayDateOnly(weekStart) ?? weekStart;
    return Array.from({ length: 5 }, (_, index) => addDaysDateOnly(start, index) ?? start);
  }, [weekStart]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ weekStart });
        if (selectedUserId) params.set("userId", selectedUserId);
        const enabledStatuses = Object.entries(statusFilter)
          .filter(([, enabled]) => enabled)
          .map(([key]) => key);
        if (enabledStatuses.length > 0) params.set("status", enabledStatuses.join(","));

        const data = await fetchJson<{ shifts: ShiftRow[] }>(`/api/admin/office-hours/shifts?${params.toString()}`);
        if (cancelled) return;
        setShifts(data.shifts ?? []);
        setSelectedShiftId((current) => {
          if (current && (data.shifts ?? []).some((shift) => shift.id === current)) return current;
          return data.shifts?.[0]?.id ?? "";
        });
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load shifts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, statusFilter, weekStart]);

  useEffect(() => {
    if (!initialComposeOpen) return;
    setDrawerMode("create");
  }, [initialComposeOpen]);

  const selectedShift = shifts.find((shift) => shift.id === selectedShiftId) ?? null;
  const shiftStats: AdminStat[] = [
    {
      id: "schedule-scheduled",
      label: "Scheduled",
      value: String(shifts.filter((shift) => shift.status === "scheduled").length),
      detail: "Future shifts still on the calendar.",
    },
    {
      id: "schedule-covered",
      label: "Covered",
      value: String(shifts.filter((shift) => shift.covered_by_user_id || shift.claimed_coverage_request_count > 0).length),
      detail: "Shifts with claimed or assigned coverage.",
    },
    {
      id: "schedule-cancelled",
      label: "Cancelled",
      value: String(shifts.filter((shift) => shift.status === "cancelled").length),
      detail: "Cancelled shifts stay visible for history.",
    },
    {
      id: "schedule-attention",
      label: "Coverage requests",
      value: String(shifts.reduce((sum, shift) => sum + shift.open_coverage_request_count, 0)),
      detail: "Open coverage requests tied to this week’s schedule.",
      tone: shifts.some((shift) => shift.open_coverage_request_count > 0) ? "warning" : "default",
    },
  ];

  const groupedByDay = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const day of weekDays) map.set(day, []);
    for (const shift of shifts) {
      const day = formatDateKeyInTimezone(shift.starts_at, shift.office_location_timezone || null);
      const collection = map.get(day);
      if (collection) collection.push(shift);
    }
    for (const collection of map.values()) {
      collection.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    }
    return map;
  }, [shifts, weekDays]);

  const orderedShifts = useMemo(() => [...shifts].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)), [shifts]);

  function openCreateDrawer() {
    setDrawerMode("create");
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
    const enabledStatuses = Object.entries(statusFilter)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);
    if (enabledStatuses.length > 0) params.set("status", enabledStatuses.join(","));
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

      const next = await reloadShifts();
      setSelectedShiftId((current) => current || next[0]?.id || "");
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
      const next = await reloadShifts();
      setSelectedShiftId(next[0]?.id ?? "");
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
            <Button variant="outline" onClick={() => setWeekStart(startOfWeekMondayDateOnly(todayDateString()) ?? todayDateString())}>
              Current week
            </Button>
            <Button variant="outline" onClick={() => setWeekStart(addDaysDateOnly(weekStart, 7) ?? weekStart)}>
              Next week
            </Button>
          </>
        }
        secondary={
          <>
            <Button onClick={openCreateDrawer}>Add shift</Button>
          </>
        }
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
        {Object.keys(statusFilter).map((statusKey) => (
          <label key={statusKey} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={statusFilter[statusKey]}
              onChange={(event) => setStatusFilter((current) => ({ ...current, [statusKey]: event.target.checked }))}
            />
            <span className="font-mono text-foreground/70">{statusKey}</span>
          </label>
        ))}
      </AdminToolbar>

      <AdminStatStrip stats={shiftStats} />

      {notice ? (
        <div className="rounded-[1.5rem] border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      ) : null}
      {error ? (
        <div className="rounded-[1.5rem] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.95fr)]">
        <AdminSurface
          title="Week calendar"
          description="Future scheduled shifts are editable and cancellable here. Past, completed, and missed shifts stay historical."
        >
          {loading ? (
            <div className="text-sm text-foreground/62">Loading shifts…</div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-5">
              {weekDays.map((day) => {
                const dayShifts = groupedByDay.get(day) ?? [];
                return (
                  <section key={day} className="rounded-[1.5rem] border border-[var(--admin-border-soft)] bg-[var(--admin-surface-muted)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground">{formatDateHeading(day)}</div>
                      <div className="text-xs uppercase tracking-[0.16em] text-[var(--admin-label)]">{dayShifts.length}</div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {dayShifts.length === 0 ? (
                        <div className="rounded-[1.15rem] border border-dashed border-[var(--admin-border-strong)] bg-white px-3 py-4 text-sm text-foreground/58">
                          No shifts
                        </div>
                      ) : (
                        dayShifts.map((shift) => {
                          const active = selectedShiftId === shift.id;
                          return (
                            <button
                              key={shift.id}
                              type="button"
                              onClick={() => setSelectedShiftId(shift.id)}
                              className={`w-full rounded-[1.25rem] border px-3 py-3 text-left transition ${
                                active
                                  ? "border-foreground/18 bg-white shadow-[0_20px_34px_-28px_rgba(15,23,42,0.28)]"
                                  : "border-[var(--admin-border-soft)] bg-white hover:border-[var(--admin-border-strong)]"
                              }`}
                            >
                              <div className="text-sm font-semibold text-foreground">{shift.user_display_name || shift.user_email || "Member"}</div>
                              <div className="mt-1 text-sm text-foreground/62">
                                {formatDateTime(shift.starts_at)} to {formatDateTime(shift.ends_at)}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                  {shift.status}
                                </span>
                                {coverageLabel(shift) ? (
                                  <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-sky-700">
                                    {coverageLabel(shift)}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </AdminSurface>

        <AdminSurface
          title={selectedShift ? "Shift details" : "Shift detail"}
          description={selectedShift ? "Review the selected shift, then edit or cancel if it has not started." : "Select a shift to inspect timing, coverage, and available actions."}
          action={selectedShift ? <Button variant="outline" onClick={() => setSelectedShiftId("")}>Clear</Button> : null}
        >
          {!selectedShift ? (
            <AdminEmptyState title="No shift selected" description="Pick a shift from the week calendar or create a new one." />
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="text-lg font-semibold text-foreground">{selectedShift.user_display_name || selectedShift.user_email || "Member"}</div>
                <div className="text-sm text-foreground/62">{selectedShift.user_email || "No email on file"}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Starts", value: formatDateTime(selectedShift.starts_at) },
                  { label: "Ends", value: formatDateTime(selectedShift.ends_at) },
                  { label: "Location", value: selectedShift.office_location_name || "Office" },
                  { label: "Status", value: selectedShift.status },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3">
                    <div className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--admin-label)]">{item.label}</div>
                    <div className="mt-2 text-sm font-semibold text-foreground">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3">
                <div className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--admin-label)]">Coverage</div>
                <div className="mt-2 space-y-2 text-sm text-foreground/72">
                  <div>Open requests: {selectedShift.open_coverage_request_count}</div>
                  <div>Claimed requests: {selectedShift.claimed_coverage_request_count}</div>
                  <div>Covered by: {selectedShift.covered_by_display_name || selectedShift.covered_by_email || "Not covered"}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => openEditDrawer(selectedShift)}
                  disabled={!getOfficeHourShiftActionState(selectedShift).canEdit || submitting}
                >
                  Edit shift
                </Button>
                <Button
                  variant="outline"
                  className="border-rose-200 text-rose-700 hover:bg-rose-50"
                  onClick={() => void cancelShift()}
                  disabled={!getOfficeHourShiftActionState(selectedShift).canCancel || submitting}
                >
                  Cancel shift
                </Button>
              </div>

              {!getOfficeHourShiftActionState(selectedShift).canEdit ? (
                <div className="text-sm text-foreground/58">
                  Only future scheduled shifts can be edited or cancelled. Historical rows remain read-only for audit.
                </div>
              ) : null}
            </div>
          )}
        </AdminSurface>
      </div>

      <AdminSurface
        title="Shift list"
        description="All visible shifts in the selected week, kept separate from the calendar for quick scanning and audit-friendly review."
      >
        {loading ? (
          <div className="text-sm text-foreground/62">Loading shift list…</div>
        ) : orderedShifts.length === 0 ? (
          <AdminEmptyState title="No shifts found" description="Broaden the filters or add the first shift for this week." />
        ) : (
          <div className="space-y-3">
            {orderedShifts.map((shift) => (
              <button
                key={shift.id}
                type="button"
                onClick={() => setSelectedShiftId(shift.id)}
                className="flex w-full flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3 text-left transition hover:border-[var(--admin-border-strong)]"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{shift.user_display_name || shift.user_email || "Member"}</div>
                  <div className="text-sm text-foreground/62">
                    {formatDateTime(shift.starts_at)} to {formatDateTime(shift.ends_at)} • {shift.office_location_name || "Office"}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    {shift.status}
                  </span>
                  {coverageLabel(shift) ? (
                    <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-sky-700">
                      {coverageLabel(shift)}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}
      </AdminSurface>

      <AdminDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={drawerMode === "create" ? "Add office hours shift" : "Edit office hours shift"}
        description="Use the drawer for create/edit only. Cancelling remains a separate explicit action so history stays intact."
      >
        <div className="space-y-5">
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

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void submitShift()} disabled={submitting}>
              {drawerMode === "create" ? "Create shift" : "Save changes"}
            </Button>
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={submitting}>
              Close
            </Button>
          </div>
        </div>
      </AdminDrawer>
    </div>
  );
}

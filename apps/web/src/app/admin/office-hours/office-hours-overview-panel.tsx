"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminStatStrip } from "@/components/admin/admin-stat-strip";
import { AdminSurface } from "@/components/admin/admin-surface";
import { AdminToolbar } from "@/components/admin/admin-toolbar";
import type { AdminStat } from "@/components/admin/admin-types";
import { Button } from "@/components/ui/button";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { buildOfficeHoursOverviewModel } from "@/lib/office-hours-admin-workspace.mjs";
import { hoursStatusLabel, rosterStatusLabel } from "@/lib/office-hours-weekly-report.mjs";

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

type SessionRow = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  office_location_name: string;
  checkin_at: string;
  checkout_at: string | null;
  status: string;
  duration_minutes: number | null;
  admin_closed_by?: string | null;
};

type ShiftRow = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  covered_by_user_id: string | null;
  covered_by_display_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  open_coverage_request_count: number;
  claimed_coverage_request_count: number;
};

type OverviewModel = {
  stats: {
    completionRateLabel: string;
    membersBehind: number;
    openSessions: number;
    trackedMinutes: number;
    attentionItems: number;
  };
  performanceRows: Array<
    WeeklyRow & {
      statusKey: "complete" | "missing" | "behind" | "not_required";
      completion: number;
    }
  >;
  liveOperations: {
    openSessions: SessionRow[];
    recentExceptions: SessionRow[];
  };
  schedulePulse: {
    scheduledCount: number;
    cancelledCount: number;
    coveredCount: number;
    openCoverageRequests: number;
  };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function formatHours(value: number): string {
  return `${Math.round(value * 10) / 10}h`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClasses(statusKey: string) {
  if (statusKey === "complete") return "bg-emerald-500/10 text-emerald-700";
  if (statusKey === "behind") return "bg-amber-500/12 text-amber-700";
  if (statusKey === "missing") return "bg-rose-500/12 text-rose-700";
  return "bg-slate-200 text-slate-600";
}

function rosterClasses(status: "assigned" | "vacant" | "no_show") {
  if (status === "assigned") return "bg-slate-100 text-slate-700";
  if (status === "no_show") return "bg-rose-500/12 text-rose-700";
  return "bg-amber-500/12 text-amber-700";
}

function coverageLabel(shift: ShiftRow): string | null {
  if (shift.status === "cancelled") return "Cancelled";
  if (shift.covered_by_user_id || shift.claimed_coverage_request_count > 0) return "Covered";
  if (shift.open_coverage_request_count > 0) return "Coverage requested";
  return null;
}

export function OfficeHoursOverviewPanel({ initialWeekStart }: { initialWeekStart: string }) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekRows, setWeekRows] = useState<WeeklyRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const weekEnd = addDaysDateOnly(weekStart, 5) ?? weekStart;
        const [weekly, sessionData, shiftData] = await Promise.all([
          fetchJson<{ weekStart: string; rows: WeeklyRow[] }>(
            `/api/admin/office-hours/export-week?format=json&disposition=inline&weekStart=${encodeURIComponent(weekStart)}`,
          ),
          fetchJson<{ sessions: SessionRow[] }>(
            `/api/admin/office-hours/sessions?startDate=${encodeURIComponent(weekStart)}&endDate=${encodeURIComponent(weekEnd)}&limit=500`,
          ),
          fetchJson<{ shifts: ShiftRow[] }>(`/api/admin/office-hours/shifts?weekStart=${encodeURIComponent(weekStart)}`),
        ]);

        if (cancelled) return;
        setWeekRows(weekly.rows ?? []);
        setSessions(sessionData.sessions ?? []);
        setShifts(shiftData.shifts ?? []);
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load Office Hours overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const model = useMemo(
    () => buildOfficeHoursOverviewModel({ weekRows, sessions, shifts }) as OverviewModel,
    [weekRows, sessions, shifts],
  );

  const stats: AdminStat[] = [
    {
      id: "office-hours-completion",
      label: "Weekly completion",
      value: model.stats.completionRateLabel,
      detail: "Based on required vs completed team hours for the selected week.",
    },
    {
      id: "office-hours-behind",
      label: "Members behind",
      value: String(model.stats.membersBehind),
      detail: "Assigned members who are currently behind or fully missing their hours.",
      tone: model.stats.membersBehind > 0 ? "warning" : "default",
    },
    {
      id: "office-hours-open",
      label: "Open sessions",
      value: String(model.stats.openSessions),
      detail: "Members currently checked in during the selected week window.",
      tone: model.stats.openSessions > 0 ? "warning" : "default",
    },
    {
      id: "office-hours-attention",
      label: "Attention items",
      value: String(model.stats.attentionItems),
      detail: "Review flags, open sessions, and unresolved coverage requests combined.",
      tone: model.stats.attentionItems > 0 ? "warning" : "default",
    },
  ];

  const currentWeekHref = startOfWeekMondayDateOnly(todayDateString()) ?? todayDateString();
  const sortedShifts = [...shifts].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const recentExceptions = [...model.liveOperations.recentExceptions].sort((a, b) => {
    const aTime = Date.parse(a.checkout_at ?? a.checkin_at);
    const bTime = Date.parse(b.checkout_at ?? b.checkin_at);
    return bTime - aTime;
  });

  return (
    <div className="space-y-5">
      <AdminToolbar
        primary={
          <>
            <label className="space-y-1 text-sm">
              <div className="text-foreground/62">Week of</div>
              <input
                type="date"
                className="h-10 rounded-xl border bg-white px-3 text-sm"
                value={weekStart}
                onChange={(event) => setWeekStart(startOfWeekMondayDateOnly(normalizeDateOnlyString(event.target.value) ?? initialWeekStart) ?? initialWeekStart)}
              />
            </label>
            <Button variant="outline" onClick={() => setWeekStart(currentWeekHref)}>
              Current week
            </Button>
          </>
        }
        secondary={
          <>
            <Link
              href={`/admin/office-hours/schedule?weekStart=${encodeURIComponent(weekStart)}&compose=1`}
              className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-medium text-background"
            >
              Add shift
            </Link>
            <Link
              href="/admin/office-hours/sessions"
              className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-4 text-sm font-medium text-foreground/85"
            >
              Open sessions
            </Link>
            <Link
              href="/office-hours/kiosk/review"
              className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-4 text-sm font-medium text-foreground/85"
            >
              Review selfies
            </Link>
            <Link
              href="/admin/office-hours/export"
              className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-4 text-sm font-medium text-foreground/85"
            >
              Export
            </Link>
          </>
        }
      />

      <AdminStatStrip stats={stats} />

      {error ? (
        <div className="rounded-[1.5rem] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.95fr)]">
        <AdminSurface
          title="Team performance"
          description="Weekly completion by member, ordered to surface deficits and review flags first."
        >
          {loading ? (
            <div className="text-sm text-foreground/62">Loading weekly performance…</div>
          ) : model.performanceRows.length === 0 ? (
            <AdminEmptyState title="No weekly performance rows" description="The selected week does not have Office Hours performance data yet." />
          ) : (
            <div className="space-y-3">
              {model.performanceRows.slice(0, 14).map((row) => {
                const progress = `${Math.round(Math.max(0, Math.min(1, row.completion)) * 100)}%`;
                const canLink = !String(row.user_id).startsWith("pending:");

                return (
                  <article key={row.user_id} className="rounded-[1.4rem] border border-[var(--admin-border-soft)] bg-white p-4 shadow-[0_16px_28px_-26px_rgba(15,23,42,0.18)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{row.name}</h3>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
                            {row.role}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${statusClasses(row.statusKey)}`}>
                            {hoursStatusLabel({ statusKey: row.statusKey, memberStatus: row.member_status })}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${rosterClasses(row.member_status)}`}>
                            {rosterStatusLabel(row.member_status)}
                          </span>
                        </div>
                        <div className="text-sm text-foreground/64">
                          {formatHours(row.total_hours)} completed of {formatHours(row.required_hours)} required
                          {row.needs_review_sessions > 0 ? ` • ${row.needs_review_sessions} review flag${row.needs_review_sessions === 1 ? "" : "s"}` : ""}
                        </div>
                      </div>

                      {canLink ? (
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/admin/office-hours/sessions?userId=${encodeURIComponent(row.user_id)}&date=${encodeURIComponent(weekStart)}&view=week`}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-3 text-xs font-medium text-foreground/80"
                          >
                            Sessions
                          </Link>
                          <Link
                            href={`/admin/office-hours/schedule?userId=${encodeURIComponent(row.user_id)}&weekStart=${encodeURIComponent(weekStart)}`}
                            className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-3 text-xs font-medium text-foreground/80"
                          >
                            Schedule
                          </Link>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.14em] text-foreground/50">
                        <span>Weekly progress</span>
                        <span>{progress}</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100">
                        <div
                          className={`h-2.5 rounded-full ${row.statusKey === "complete" ? "bg-emerald-500" : row.statusKey === "behind" ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: progress }}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </AdminSurface>

        <div className="space-y-5">
          <AdminSurface
            title="Live operations"
            description="Open sessions and recent exceptions that need admin attention first."
          >
            {loading ? (
              <div className="text-sm text-foreground/62">Loading live operations…</div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-label)]">Open sessions</div>
                  {model.liveOperations.openSessions.length === 0 ? (
                    <div className="rounded-[1.25rem] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] px-4 py-3 text-sm text-foreground/62">
                      No members are checked in right now.
                    </div>
                  ) : (
                    model.liveOperations.openSessions.slice(0, 5).map((session) => (
                      <Link
                        key={session.id}
                        href={`/admin/office-hours/sessions?userId=${encodeURIComponent(session.user_id)}&date=${encodeURIComponent(weekStart)}&view=week`}
                        className="block rounded-[1.25rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3 transition hover:border-[var(--admin-border-strong)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{session.user_display_name || session.user_email || "Member"}</div>
                            <div className="text-sm text-foreground/62">{session.office_location_name || "Office"} • checked in {formatDateTime(session.checkin_at)}</div>
                          </div>
                          <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-700">
                            Open
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--admin-label)]">Recent exceptions</div>
                  {recentExceptions.length === 0 ? (
                    <div className="rounded-[1.25rem] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] px-4 py-3 text-sm text-foreground/62">
                      No auto-closed or admin-closed sessions in this window.
                    </div>
                  ) : (
                    recentExceptions.slice(0, 5).map((session) => (
                      <Link
                        key={session.id}
                        href={`/admin/office-hours/sessions?userId=${encodeURIComponent(session.user_id)}&date=${encodeURIComponent(weekStart)}&view=week`}
                        className="block rounded-[1.25rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3 transition hover:border-[var(--admin-border-strong)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{session.user_display_name || session.user_email || "Member"}</div>
                            <div className="text-sm text-foreground/62">
                              {session.status === "auto_closed" ? "Auto-closed" : "Admin-closed"} • {formatDateTime(session.checkout_at ?? session.checkin_at)}
                            </div>
                          </div>
                          <span className="rounded-full bg-rose-500/12 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-rose-700">
                            {session.status === "auto_closed" ? "Auto-closed" : "Admin-closed"}
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </AdminSurface>

          <AdminSurface
            title="Schedule pulse"
            description="Upcoming week coverage, cancellations, and shifts that still need attention."
          >
            {loading ? (
              <div className="text-sm text-foreground/62">Loading schedule pulse…</div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Scheduled", value: String(model.schedulePulse.scheduledCount) },
                    { label: "Cancelled", value: String(model.schedulePulse.cancelledCount) },
                    { label: "Covered", value: String(model.schedulePulse.coveredCount) },
                    { label: "Coverage requests", value: String(model.schedulePulse.openCoverageRequests) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[1.25rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3">
                      <div className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--admin-label)]">{item.label}</div>
                      <div className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">{item.value}</div>
                    </div>
                  ))}
                </div>

                {sortedShifts.length === 0 ? (
                  <AdminEmptyState title="No shifts this week" description="Create the week’s Office Hours assignments from the Schedule workspace." />
                ) : (
                  <div className="space-y-3">
                    {sortedShifts.slice(0, 6).map((shift) => (
                      <Link
                        key={shift.id}
                        href={`/admin/office-hours/schedule?weekStart=${encodeURIComponent(weekStart)}&userId=${encodeURIComponent(shift.user_id)}`}
                        className="block rounded-[1.25rem] border border-[var(--admin-border-soft)] bg-white px-4 py-3 transition hover:border-[var(--admin-border-strong)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{shift.user_display_name || shift.user_email || "Member"}</div>
                            <div className="text-sm text-foreground/62">{formatDateTime(shift.starts_at)} to {formatDateTime(shift.ends_at)}</div>
                          </div>
                          {coverageLabel(shift) ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-600">
                              {coverageLabel(shift)}
                            </span>
                          ) : null}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </AdminSurface>
        </div>
      </div>
    </div>
  );
}

"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminStatStrip } from "@/components/admin/admin-stat-strip";
import { AdminStatusChip } from "@/components/admin/admin-status-chip";
import { AdminSurface } from "@/components/admin/admin-surface";
import { AdminToolbar } from "@/components/admin/admin-toolbar";
import type { AdminStat } from "@/components/admin/admin-types";
import { Button } from "@/components/ui/button";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import {
  completionPercent,
  reportStatus,
  rosterStatusLabel,
  roleGroupLabel,
  roleKeyRank,
  sortWeeklyReportRows,
} from "@/lib/office-hours-weekly-report.mjs";

type AdminWeeklyHoursPreviewRow = {
  user_id: string;
  week_start: string;
  email: string;
  role_key: string | null;
  role: string;
  name: string;
  required_hours: number | string;
  total_hours: number | string;
  missing_hours: number | string;
  needs_review_sessions: number | string;
  member_status?: "assigned" | "vacant" | "no_show";
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function parseHoursValue(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatHours(value: number): string {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const rounded = Math.round(v * 100) / 100;
  return `${rounded.toFixed(2)}h`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  return ok;
}

function statusPill(statusKey: string): { label: string; tone: "critical" | "warning" | "neutral" | "good"; icon: "triangle" | "clock" | "dot" | "check" } {
  if (statusKey === "complete") return { label: "Complete", tone: "good", icon: "check" };
  if (statusKey === "missing") return { label: "Missing", tone: "critical", icon: "triangle" };
  if (statusKey === "behind") return { label: "Behind", tone: "warning", icon: "clock" };
  return { label: "Not required", tone: "neutral", icon: "dot" };
}

export function OfficeHoursExportPanel({ initialWeekStart }: { initialWeekStart: string | null }) {
  const [anchorDate, setAnchorDate] = useState<string>(() => normalizeDateOnlyString(initialWeekStart) ?? todayDateString());
  const [rows, setRows] = useState<AdminWeeklyHoursPreviewRow[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [actionStatus, setActionStatus] = useState<string>("");
  const actionTimerRef = useRef<number | null>(null);
  const [rowSearch, setRowSearch] = useState<string>("");
  const [missingOnly, setMissingOnly] = useState<boolean>(false);

  const weekStartResolved = useMemo(
    () => startOfWeekMondayDateOnly(anchorDate) ?? startOfWeekMondayDateOnly(todayDateString()),
    [anchorDate],
  );

  const quickWeekOptions = useMemo(() => {
    const current = startOfWeekMondayDateOnly(todayDateString());
    if (!current) return [] as Array<{ value: string; label: string }>;
    const values: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const next = addDaysDateOnly(current, -7 * i);
      if (next) values.push(next);
    }
    if (weekStartResolved && !values.includes(weekStartResolved)) values.unshift(weekStartResolved);
    return values.map((value) => ({
      value,
      label: value === current ? `This week (${value})` : value === weekStartResolved ? `Selected (${value})` : value,
    }));
  }, [weekStartResolved]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatus("Loading report…");
      try {
        const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}&format=json` : "?format=json";
        const data = await fetchJson<{ weekStart: string; rows: AdminWeeklyHoursPreviewRow[] }>(
          `/api/admin/office-hours/export-week${qs}`,
        );
        if (cancelled) return;
        setRows(data.rows ?? []);
        setStatus("");
      } catch (e) {
        if (cancelled) return;
        setRows(null);
        setStatus(e instanceof Error ? e.message : "Failed to load report");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [weekStartResolved]);

  useEffect(() => {
    return () => {
      if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current);
    };
  }, []);

  function setTransientActionStatus(message: string) {
    setActionStatus(message);
    if (actionTimerRef.current) window.clearTimeout(actionTimerRef.current);
    actionTimerRef.current = window.setTimeout(() => {
      setActionStatus("");
      actionTimerRef.current = null;
    }, 2500);
  }

  function downloadCsv() {
    const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}` : "";
    window.location.href = `/api/admin/office-hours/export-week${qs}`;
  }

  function openCsvView() {
    const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}` : "";
    window.open(`/admin/office-hours/export/csv${qs}`, "_blank", "noopener,noreferrer");
  }

  async function handleCopyEmails(kind: "all" | "missing") {
    const list = (visibleRows ?? []).filter((row) => {
      if (kind === "missing") {
        return parseHoursValue(row.missing_hours) > 0;
      }
      return true;
    });

    const emails = list.map((row) => row.email).filter((email): email is string => Boolean(email && email.trim()));
    if (emails.length === 0) {
      setTransientActionStatus("No emails to copy.");
      return;
    }

    try {
      const ok = await copyToClipboard(emails.join("\n"));
      setTransientActionStatus(ok ? `Copied ${emails.length} email${emails.length === 1 ? "" : "s"}.` : "Copy failed.");
    } catch {
      setTransientActionStatus("Copy failed.");
    }
  }

  const orderedRows = useMemo(() => sortWeeklyReportRows(rows ?? []), [rows]);

  const visibleRows = (() => {
    const query = rowSearch.trim().toLowerCase();
    return orderedRows.filter((r) => {
      if (missingOnly && parseHoursValue(r.missing_hours) <= 0) return false;
      if (!query) return true;
      const hay = `${r.role ?? ""} ${r.name ?? ""} ${r.email ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  })();

  const groups = useMemo(() => {
    const map = new Map<string, AdminWeeklyHoursPreviewRow[]>();
    for (const row of visibleRows) {
      const key = row.role_key ?? "member";
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    const keys = [...map.keys()].sort((a, b) => roleKeyRank(a) - roleKeyRank(b));
    return keys.map((key) => ({ key, rows: map.get(key) ?? [] }));
  }, [visibleRows]);

  const summary = useMemo(() => {
    let complete = 0;
    let behind = 0;
    let missing = 0;
    let notRequired = 0;
    let vacant = 0;
    let noShow = 0;
    let requiredTotal = 0;
    let completedTotal = 0;
    let missingTotal = 0;

    for (const row of visibleRows) {
      const required = parseHoursValue(row.required_hours);
      const completed = parseHoursValue(row.total_hours);
      const rem = parseHoursValue(row.missing_hours);

      requiredTotal += Math.max(0, required);
      completedTotal += Math.max(0, completed);
      missingTotal += Math.max(0, rem);

      const statusKey = reportStatus({
        required_hours: required,
        total_hours: completed,
        missing_hours: rem,
      });

      if (row.member_status === "vacant") vacant += 1;
      else if (row.member_status === "no_show") noShow += 1;

      if (statusKey === "complete") complete += 1;
      else if (statusKey === "behind") behind += 1;
      else if (statusKey === "missing") missing += 1;
      else notRequired += 1;
    }

    return {
      total: visibleRows.length,
      complete,
      behind,
      missing,
      notRequired,
      vacant,
      noShow,
      requiredTotal,
      completedTotal,
      missingTotal,
    };
  }, [visibleRows]);

  const filtersActive = rowSearch.trim().length > 0 || missingOnly;
  const stats: AdminStat[] = [
    {
      id: "export-members",
      label: "Members",
      value: String(summary.total),
      detail: `${summary.vacant} vacant • ${summary.noShow} no show`,
    },
    {
      id: "export-compliance",
      label: "Complete",
      value: String(summary.complete),
      detail: `${summary.behind + summary.missing} behind or missing`,
    },
    {
      id: "export-required",
      label: "Required",
      value: formatHours(summary.requiredTotal),
      detail: "Target this week",
    },
    {
      id: "export-missing",
      label: "Missing",
      value: formatHours(summary.missingTotal),
      detail: status ? status : actionStatus || "Current visible rows",
      tone: summary.missingTotal > 0 ? "warning" : "default",
    },
  ];

  function resetFilters() {
    setRowSearch("");
    setMissingOnly(false);
  }

  return (
    <div className="space-y-5">
      <AdminStatStrip stats={stats} />

      <AdminSurface
        title="Week selection"
        description={`Week starts ${weekStartResolved ?? "—"} • Blank-name roles are marked as Vacant.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => window.location.assign("/admin/office-hours")}>
              Calendar view
            </Button>
            <Button variant="ghost" onClick={openCsvView}>
              CSV preview
            </Button>
            <Button onClick={downloadCsv}>Download CSV</Button>
          </div>
        }
      >
        <AdminToolbar
          primary={
            <>
              <Button variant="outline" size="sm" onClick={() => setAnchorDate((d) => addDaysDateOnly(d, -7) ?? todayDateString())}>
                Prev
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAnchorDate(todayDateString())}>
                This week
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAnchorDate((d) => addDaysDateOnly(d, 7) ?? todayDateString())}>
                Next
              </Button>
            </>
          }
          secondary={
            <>
              <Button variant="outline" size="sm" onClick={() => void handleCopyEmails("missing")} disabled={summary.total === 0}>
                Copy missing emails
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void handleCopyEmails("all")} disabled={summary.total === 0}>
                Copy all emails
              </Button>
            </>
          }
        >
          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Quick week</div>
            <select
              className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
              value={weekStartResolved ?? ""}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setAnchorDate(normalizeDateOnlyString(e.target.value) ?? todayDateString())
              }
            >
              {quickWeekOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Week of</div>
            <input
              type="date"
              className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
              value={anchorDate}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setAnchorDate(normalizeDateOnlyString(e.target.value) ?? todayDateString())
              }
            />
          </label>
          <label className="space-y-1 text-sm">
            <div className="text-foreground/62">Search</div>
            <input
              type="text"
              className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
              value={rowSearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setRowSearch(e.target.value)}
              placeholder="Search name, email, or role..."
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMissingOnly(e.target.checked)}
            />
            <span className="text-foreground/70">Show missing only</span>
          </label>
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!filtersActive}>
            Reset
          </Button>
        </AdminToolbar>
        {actionStatus ? <div className="mt-4 text-xs text-foreground/70">{actionStatus}</div> : null}
        {status ? <div className="mt-2 text-sm text-foreground/70">{status}</div> : null}
      </AdminSurface>

      <div className="space-y-4">
        {groups.length === 0 ? (
          <AdminEmptyState
            title={filtersActive ? "No rows match the current filters" : "No rows returned for this week"}
            description="Try a different week or clear the active filters."
          />
        ) : null}

        {groups.map((g) => (
          <div key={g.key} className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b bg-foreground/[0.03] px-4 py-3">
              <div className="text-sm font-semibold">{roleGroupLabel(g.key)}</div>
              <div className="text-xs text-foreground/60">{g.rows.length} people</div>
            </div>

            <div className="divide-y">
              {g.rows.map((r) => {
                const required = parseHoursValue(r.required_hours);
                const completed = parseHoursValue(r.total_hours);
                const missingH = parseHoursValue(r.missing_hours);
                const pct = completionPercent({
                  required_hours: required,
                  total_hours: completed,
                });
                const statusKey = reportStatus({
                  required_hours: required,
                  total_hours: completed,
                  missing_hours: missingH,
                });
                const pill = statusPill(statusKey);
                const needsReview = Number.parseInt(String(r.needs_review_sessions ?? 0), 10) || 0;
                const progressClass =
                  statusKey === "complete"
                    ? "bg-emerald-500"
                    : statusKey === "missing"
                      ? "bg-red-500"
                      : statusKey === "behind"
                        ? "bg-amber-500"
                        : "bg-slate-400";
                const rowTone =
                  statusKey === "complete"
                    ? "bg-white"
                    : statusKey === "not_required"
                      ? "bg-slate-50/50"
                      : "bg-red-50/40";

                return (
                  <div key={`${r.user_id}:${r.week_start}`} className={rowTone}>
                    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[1.7fr_1fr_0.9fr] sm:items-center">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{r.role || "—"}</span>
                          <span className="text-xs text-foreground/60">•</span>
                          <span className="text-sm">{r.name || "—"}</span>
                          <AdminStatusChip tone={pill.tone} icon={pill.icon} label={pill.label} />
                          {r.member_status === "vacant" || r.member_status === "no_show" ? (
                            <AdminStatusChip
                              tone={r.member_status === "vacant" ? "neutral" : "warning"}
                              icon={r.member_status === "vacant" ? "dot" : "clock"}
                              label={rosterStatusLabel(r.member_status)}
                            />
                          ) : null}
                          {needsReview > 0 ? (
                            <AdminStatusChip tone="warning" icon="clock" label="Needs review" count={needsReview} />
                          ) : null}
                        </div>
                        <div className="text-xs text-foreground/60">
                          Required {formatHours(required)} • Completed {formatHours(completed)} • Missing {formatHours(missingH)}
                        </div>
                        {r.email ? <div className="text-[11px] text-foreground/50">{r.email}</div> : null}
                      </div>

                      <div className="space-y-1.5">
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className={`h-full ${progressClass}`}
                            style={{ width: `${Math.round(pct * 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-foreground/60">{Math.round(pct * 100)}% complete</div>
                      </div>

                      <div className="flex justify-between gap-3 text-xs sm:justify-end">
                        <div className="text-right">
                          <div className="text-[11px] uppercase tracking-wide text-foreground/60">Missing</div>
                          <div className="font-mono text-sm">{formatHours(missingH)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] uppercase tracking-wide text-foreground/60">Completed</div>
                          <div className="font-mono text-sm">{formatHours(completed)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

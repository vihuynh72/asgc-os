"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import {
  completionPercent,
  hoursStatusLabel,
  reportStatus,
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

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return res.text();
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

function statusPill(
  statusKey: ReturnType<typeof reportStatus>,
  memberStatus: AdminWeeklyHoursPreviewRow["member_status"],
): { label: string; className: string } {
  if (memberStatus === "vacant") {
    return { label: hoursStatusLabel({ statusKey, memberStatus }), className: "bg-slate-500/15 text-slate-700" };
  }
  if (memberStatus === "no_show" && statusKey === "missing") {
    return { label: hoursStatusLabel({ statusKey, memberStatus }), className: "bg-rose-500/15 text-rose-700" };
  }
  if (statusKey === "complete") return { label: "Complete", className: "bg-emerald-500/15 text-emerald-700" };
  if (statusKey === "missing") return { label: "Missing", className: "bg-red-500/15 text-red-700" };
  if (statusKey === "behind") return { label: "Behind", className: "bg-amber-500/15 text-amber-700" };
  return { label: "Not required", className: "bg-foreground/10 text-foreground/70" };
}

function rosterPill(memberStatus: AdminWeeklyHoursPreviewRow["member_status"]): { label: string; className: string } {
  if (memberStatus === "vacant") return { label: "Vacant", className: "bg-slate-500/15 text-slate-700" };
  if (memberStatus === "no_show") return { label: "No show", className: "bg-rose-500/15 text-rose-700" };
  return { label: "Assigned", className: "bg-emerald-500/15 text-emerald-700" };
}

function rowBackground(statusKey: ReturnType<typeof reportStatus>): string {
  if (statusKey === "missing") return "bg-red-500/[0.06]";
  if (statusKey === "behind") return "bg-amber-500/[0.06]";
  if (statusKey === "not_required") return "bg-foreground/[0.02]";
  return "";
}

export function OfficeHoursCsvPanel({ initialWeekStart }: { initialWeekStart: string | null }) {
  const [anchorDate, setAnchorDate] = useState<string>(() => normalizeDateOnlyString(initialWeekStart) ?? todayDateString());
  const [csvText, setCsvText] = useState<string>("");
  const [rows, setRows] = useState<AdminWeeklyHoursPreviewRow[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [actionStatus, setActionStatus] = useState<string>("");
  const actionTimerRef = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<"report" | "table" | "raw">("report");
  const [search, setSearch] = useState<string>("");
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
      setStatus("Loading…");
      try {
        const baseParams = new URLSearchParams();
        if (weekStartResolved) baseParams.set("weekStart", weekStartResolved);

        const csvParams = new URLSearchParams(baseParams);
        csvParams.set("format", "csv");

        const jsonParams = new URLSearchParams(baseParams);
        jsonParams.set("format", "json");

        const csvUrl = `/api/admin/office-hours/export-week?${csvParams.toString()}`;
        const jsonUrl = `/api/admin/office-hours/export-week?${jsonParams.toString()}`;

        const [csv, json] = await Promise.all([
          fetchText(csvUrl),
          fetchJson<{ weekStart: string; rows: AdminWeeklyHoursPreviewRow[] }>(jsonUrl),
        ]);
        if (cancelled) return;
        setCsvText(csv);
        setRows(json.rows ?? []);
        setStatus("");
      } catch (e) {
        if (cancelled) return;
        setCsvText("");
        setRows(null);
        setStatus(e instanceof Error ? e.message : "Failed to load");
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

  async function copyCsv() {
    if (!csvText.trim()) {
      setTransientActionStatus("No CSV content to copy.");
      return;
    }
    try {
      const ok = await copyToClipboard(csvText);
      setTransientActionStatus(ok ? "CSV copied to clipboard." : "Copy failed.");
    } catch {
      setTransientActionStatus("Copy failed.");
    }
  }

  function downloadCsv() {
    const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}` : "";
    window.location.href = `/api/admin/office-hours/export-week${qs}`;
  }

  function openReport() {
    const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}` : "";
    window.open(`/admin/office-hours/export${qs}`, "_blank", "noopener,noreferrer");
  }

  const orderedRows = useMemo(() => sortWeeklyReportRows(rows ?? []), [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orderedRows.filter((r) => {
      if (missingOnly && parseHoursValue(r.missing_hours) <= 0) return false;
      if (!q) return true;
      const hay = `${r.role ?? ""} ${r.name ?? ""} ${r.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orderedRows, search, missingOnly]);

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

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Week starts {weekStartResolved ?? "—"}</div>
            <div className="text-xs text-foreground/70">Report view is recommended. Use table/raw for copy & spreadsheets.</div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchorDate((d) => addDaysDateOnly(d, -7) ?? todayDateString())}>
              Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchorDate(todayDateString())}>
              This week
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchorDate((d) => addDaysDateOnly(d, 7) ?? todayDateString())}>
              Next
            </Button>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Quick week</div>
              <select
                className="h-9 w-48 rounded-md border bg-transparent px-2 text-sm"
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
              <div className="text-foreground/70">Week of (any date)</div>
              <input
                type="date"
                className="h-9 w-56 rounded-md border bg-transparent px-2 text-sm"
                value={anchorDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setAnchorDate(normalizeDateOnlyString(e.target.value) ?? todayDateString())
                }
              />
            </label>

            <Button variant="outline" onClick={openReport}>
              Open report
            </Button>
            <Button variant="outline" onClick={copyCsv}>
              Copy CSV
            </Button>
            <Button onClick={downloadCsv}>Download CSV</Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className={cn(viewMode === "report" && "bg-foreground/5")}
              onClick={() => setViewMode("report")}
            >
              Report
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(viewMode === "table" && "bg-foreground/5")}
              onClick={() => setViewMode("table")}
            >
              Table
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(viewMode === "raw" && "bg-foreground/5")}
              onClick={() => setViewMode("raw")}
            >
              Raw
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs">
              <div className="text-foreground/70">Search</div>
              <input
                type="text"
                className="h-9 w-64 rounded-md border bg-transparent px-2 text-sm"
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                placeholder="Search name, email, or role..."
              />
            </label>
            <Button variant="ghost" size="sm" onClick={() => setSearch("")} disabled={!search.trim()}>
              Clear
            </Button>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setMissingOnly(e.target.checked)}
              />
              <span className="text-foreground/70">Show missing only</span>
            </label>
          </div>
        </div>
      </div>

      {actionStatus ? <div className="text-xs text-foreground/70">{actionStatus}</div> : null}
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      {viewMode === "report" ? (
        <div className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">Summary</div>
                <div className="text-xs text-foreground/70">
                  {summary.total} people • {summary.complete} complete • {summary.behind} behind • {summary.missing} missing •{" "}
                  {summary.notRequired} not required • {summary.vacant} vacant • {summary.noShow} no show
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-foreground/70">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-foreground/60">Required</div>
                  <div className="font-mono text-sm text-foreground">{formatHours(summary.requiredTotal)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-foreground/60">Completed</div>
                  <div className="font-mono text-sm text-foreground">{formatHours(summary.completedTotal)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-foreground/60">Missing</div>
                  <div className="font-mono text-sm text-foreground">{formatHours(summary.missingTotal)}</div>
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-1 text-[11px] text-foreground/60 sm:grid-cols-2">
              <div>
                <span className="font-medium text-foreground/75">Required / Completed / Missing</span>: weekly target, logged hours, and
                remaining hours.
              </div>
              <div>
                <span className="font-medium text-foreground/75">Vacant</span>: no assigned member.{" "}
                <span className="font-medium text-foreground/75">No show</span>: assigned member with zero logged hours.
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.key} className="rounded-md border">
                <div className="flex items-center justify-between gap-3 border-b bg-foreground/5 px-3 py-2">
                  <div className="text-sm font-medium">{roleGroupLabel(g.key)}</div>
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
                    const pill = statusPill(statusKey, r.member_status);
                    const roster = rosterPill(r.member_status);
                    const needsReview = Number.parseInt(String(r.needs_review_sessions ?? 0), 10) || 0;

                    return (
                      <div key={`${r.user_id}:${r.week_start}`} className={rowBackground(statusKey)}>
                        <div className="grid gap-2 px-3 py-3 sm:grid-cols-[1.4fr_1fr_0.8fr] sm:items-center">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{r.role || "—"}</span>
                              <span className="text-xs text-foreground/60">•</span>
                              <span className="text-sm">{r.name || "Vacant"}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs ${roster.className}`}>{roster.label}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs ${pill.className}`}>{pill.label}</span>
                              {needsReview > 0 ? (
                                <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-700">
                                  Needs review ({needsReview})
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-foreground/60">
                              Required {formatHours(required)} • Completed {formatHours(completed)} • Missing {formatHours(missingH)}
                            </div>
                            {r.email ? <div className="text-[11px] text-foreground/50">{r.email}</div> : null}
                          </div>

                          <div className="space-y-1">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                              <div
                                className={statusKey === "complete" ? "h-full bg-emerald-500" : "h-full bg-amber-500"}
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
      ) : null}

      {viewMode === "table" ? (
        <div className="rounded-md border p-3">
          <div className="mb-3 text-xs text-foreground/70">
            Compact table view for fast scanning. The downloaded CSV includes additional symbol flags.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-foreground/5 text-left text-xs font-semibold text-foreground/70">
                <tr>
                  <th className="px-3 py-2">Position</th>
                  <th className="px-3 py-2">Member</th>
                  <th className="px-3 py-2">Roster</th>
                  <th className="px-3 py-2 text-right">Required</th>
                  <th className="px-3 py-2 text-right">Completed</th>
                  <th className="px-3 py-2 text-right">Missing</th>
                  <th className="px-3 py-2">Completion</th>
                  <th className="px-3 py-2">Hours Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleRows.map((r, idx) => {
                  const required = parseHoursValue(r.required_hours);
                  const completed = parseHoursValue(r.total_hours);
                  const missingH = parseHoursValue(r.missing_hours);
                  const statusKey = reportStatus({
                    required_hours: required,
                    total_hours: completed,
                    missing_hours: missingH,
                  });
                  const status = statusPill(statusKey, r.member_status);
                  const roster = rosterPill(r.member_status);
                  const completion = completionPercent({
                    required_hours: required,
                    total_hours: completed,
                  });
                  const completionLabel = `${Math.round(completion * 100)}%`;
                  const needsReview = Number.parseInt(String(r.needs_review_sessions ?? 0), 10) || 0;
                  const rowTone = rowBackground(statusKey) || (idx % 2 === 1 ? "bg-foreground/[0.01]" : "");
                  const completionBarTone =
                    statusKey === "complete"
                      ? "bg-emerald-500"
                      : statusKey === "missing"
                        ? "bg-red-500"
                        : statusKey === "behind"
                          ? "bg-amber-500"
                          : "bg-foreground/30";

                  return (
                    <tr key={idx} className={rowTone}>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium">{r.role || "Member"}</div>
                        <div className="text-xs text-foreground/60">{roleGroupLabel(r.role_key ?? null)}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className={cn("font-medium", r.member_status === "vacant" && "text-foreground/70")}>
                          {r.name || "Vacant"}
                        </div>
                        <div className="text-xs text-foreground/60">{r.email || "No email on file"}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${roster.className}`}>
                          {roster.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{formatHours(required)}</td>
                      <td className="px-3 py-3 text-right font-mono">{formatHours(completed)}</td>
                      <td className="px-3 py-3 text-right font-mono">{formatHours(missingH)}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="w-28 space-y-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                            <div className={completionBarTone} style={{ width: `${Math.round(completion * 100)}%`, height: "100%" }} />
                          </div>
                          <div className="text-xs font-medium text-foreground/70">{completionLabel}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                          {status.label}
                        </span>
                        {needsReview > 0 ? (
                          <div className="mt-1 text-xs text-indigo-700">Needs review: {needsReview}</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-foreground/60" colSpan={8}>
                      No rows.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {viewMode === "raw" ? (
        <div className="rounded-md border p-3">
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs">{csvText}</pre>
        </div>
      ) : null}
    </div>
  );
}

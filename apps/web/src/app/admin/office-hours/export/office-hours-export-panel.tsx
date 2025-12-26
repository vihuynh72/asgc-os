"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";

type AdminWeeklyHoursPreviewRow = {
  user_id: string;
  week_start: string;
  display_name: string;
  email: string;
  total_minutes: number | string;
  in_office_minutes: number | string;
  deficit_minutes: number | string;
  deficit_in_office_minutes: number | string;
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

function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${minutesPart}m`;
}

function parseMinutesValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMinutesValue(value: number | string | null | undefined): string {
  const n = parseMinutesValue(value);
  return n === null ? "—" : formatMinutes(n);
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

function toCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/\"/g, "\"\"")}"`;
  }
  return raw;
}

export function OfficeHoursExportPanel({ initialWeekStart }: { initialWeekStart: string | null }) {
  const [anchorDate, setAnchorDate] = useState<string>(() => normalizeDateOnlyString(initialWeekStart) ?? todayDateString());
  const [rows, setRows] = useState<AdminWeeklyHoursPreviewRow[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [actionStatus, setActionStatus] = useState<string>("");
  const actionTimerRef = useRef<number | null>(null);
  const [rowSearch, setRowSearch] = useState<string>("");
  const [deficitOnly, setDeficitOnly] = useState<boolean>(false);
  const [inOfficeDeficitOnly, setInOfficeDeficitOnly] = useState<boolean>(false);
  const [minDeficitMinutes, setMinDeficitMinutes] = useState<string>("");
  const [minInOfficeDeficitMinutes, setMinInOfficeDeficitMinutes] = useState<string>("");
  const [sortKey, setSortKey] = useState<"name" | "total" | "deficit" | "deficit_in_office">("name");

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
    if (weekStartResolved && !values.includes(weekStartResolved)) {
      values.unshift(weekStartResolved);
    }
    return values.map((value) => ({
      value,
      label: value === current ? `This week (${value})` : value === weekStartResolved ? `Selected (${value})` : value,
    }));
  }, [weekStartResolved]);

  const filteredRows = useMemo(() => {
    const base = rows ?? [];
    const query = rowSearch.trim().toLowerCase();
    const minDeficitValue = Number(minDeficitMinutes);
    const minInOfficeDeficitValue = Number(minInOfficeDeficitMinutes);
    const minDeficit = Number.isFinite(minDeficitValue) && minDeficitValue > 0 ? minDeficitValue : null;
    const minInOfficeDeficit =
      Number.isFinite(minInOfficeDeficitValue) && minInOfficeDeficitValue > 0
        ? minInOfficeDeficitValue
        : null;
    const filtered = base.filter((r) => {
      if (deficitOnly) {
        const deficit = parseMinutesValue(r.deficit_minutes) ?? 0;
        if (deficit <= 0) return false;
      }
      if (inOfficeDeficitOnly) {
        const deficit = parseMinutesValue(r.deficit_in_office_minutes) ?? 0;
        if (deficit <= 0) return false;
      }
      if (minDeficit !== null) {
        const deficit = parseMinutesValue(r.deficit_minutes) ?? 0;
        if (deficit < minDeficit) return false;
      }
      if (minInOfficeDeficit !== null) {
        const deficit = parseMinutesValue(r.deficit_in_office_minutes) ?? 0;
        if (deficit < minInOfficeDeficit) return false;
      }
      if (!query) return true;
      const hay = `${r.display_name ?? ""} ${r.email ?? ""}`.toLowerCase();
      return hay.includes(query);
    });

    const toMinutes = (value: number | string | null | undefined): number => {
      const parsed = parseMinutesValue(value);
      return parsed === null ? -1 : parsed;
    };
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "name") {
        const aName = (a.display_name || a.email || "").toLowerCase();
        const bName = (b.display_name || b.email || "").toLowerCase();
        return aName.localeCompare(bName);
      }
      if (sortKey === "total") {
        return toMinutes(b.total_minutes) - toMinutes(a.total_minutes);
      }
      if (sortKey === "deficit_in_office") {
        return toMinutes(b.deficit_in_office_minutes) - toMinutes(a.deficit_in_office_minutes);
      }
      return toMinutes(b.deficit_minutes) - toMinutes(a.deficit_minutes);
    });

    return sorted;
  }, [rows, rowSearch, deficitOnly, inOfficeDeficitOnly, minDeficitMinutes, minInOfficeDeficitMinutes, sortKey]);

  const filtersActive =
    rowSearch.trim().length > 0 ||
    deficitOnly ||
    inOfficeDeficitOnly ||
    sortKey !== "name" ||
    Number(minDeficitMinutes) > 0 ||
    Number(minInOfficeDeficitMinutes) > 0;

  const summary = useMemo(() => {
    const list = filteredRows;
    let deficitCount = 0;
    let inOfficeDeficitCount = 0;
    let totalDeficit = 0;
    let totalInOfficeDeficit = 0;

    for (const row of list) {
      const deficit = parseMinutesValue(row.deficit_minutes) ?? 0;
      const inOfficeDeficit = parseMinutesValue(row.deficit_in_office_minutes) ?? 0;
      if (deficit > 0) deficitCount += 1;
      if (inOfficeDeficit > 0) inOfficeDeficitCount += 1;
      totalDeficit += Math.max(0, deficit);
      totalInOfficeDeficit += Math.max(0, inOfficeDeficit);
    }

    return {
      totalRows: list.length,
      deficitCount,
      inOfficeDeficitCount,
      totalDeficit,
      totalInOfficeDeficit,
    };
  }, [filteredRows]);

  function setTransientActionStatus(message: string) {
    setActionStatus(message);
    if (actionTimerRef.current) {
      window.clearTimeout(actionTimerRef.current);
    }
    actionTimerRef.current = window.setTimeout(() => {
      setActionStatus("");
      actionTimerRef.current = null;
    }, 2500);
  }

  async function handleCopyEmails(kind: "all" | "deficit" | "in_office_deficit") {
    const list = filteredRows.filter((row) => {
      if (kind === "deficit") {
        const deficit = parseMinutesValue(row.deficit_minutes) ?? 0;
        return deficit > 0;
      }
      if (kind === "in_office_deficit") {
        const deficit = parseMinutesValue(row.deficit_in_office_minutes) ?? 0;
        return deficit > 0;
      }
      return true;
    });

    const emails = list
      .map((row) => row.email)
      .filter((email): email is string => Boolean(email && email.trim()));

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

  function downloadFilteredCsv() {
    const header = [
      "week_start",
      "name",
      "email",
      "total_minutes",
      "in_office_minutes",
      "deficit_minutes",
      "deficit_in_office_minutes",
    ];
    const lines = [
      header.map(toCsvValue).join(","),
      ...filteredRows.map((row) => {
        const values = [
          row.week_start,
          row.display_name ?? "",
          row.email ?? "",
          parseMinutesValue(row.total_minutes) ?? "",
          parseMinutesValue(row.in_office_minutes) ?? "",
          parseMinutesValue(row.deficit_minutes) ?? "",
          parseMinutesValue(row.deficit_in_office_minutes) ?? "",
        ];
        return values.map(toCsvValue).join(",");
      }),
    ];

    const csv = `${lines.join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `office-hours-${weekStartResolved ?? "week"}-filtered.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
    setTransientActionStatus("Filtered CSV downloaded.");
  }

  function resetFilters() {
    setRowSearch("");
    setDeficitOnly(false);
    setInOfficeDeficitOnly(false);
    setMinDeficitMinutes("");
    setMinInOfficeDeficitMinutes("");
    setSortKey("name");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading preview…");
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
        setStatus(e instanceof Error ? e.message : "Failed to load preview");
        setRows(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [weekStartResolved]);

  useEffect(() => {
    return () => {
      if (actionTimerRef.current) {
        window.clearTimeout(actionTimerRef.current);
      }
    };
  }, []);

  function downloadCsv() {
    const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}` : "";
    window.location.href = `/api/admin/office-hours/export-week${qs}`;
  }

  function openCsvView() {
    const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}` : "";
    window.open(`/admin/office-hours/export/csv${qs}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Week starts {weekStartResolved ?? "—"}</div>
            <div className="text-xs text-foreground/70">Durations are shown as hours + minutes (h m).</div>
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

            <Button variant="outline" onClick={() => window.location.assign("/admin/office-hours")}>
              Calendar view
            </Button>
            <Button variant="outline" onClick={openCsvView}>
              View CSV
            </Button>
            <Button onClick={downloadCsv}>Download CSV</Button>
          </div>
        </div>
      </div>

      {actionStatus ? (
        <div className="rounded-md border px-3 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
          {actionStatus}
        </div>
      ) : null}

      {status ? (
        <div className="rounded-md border px-3 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      {rows ? (
        <div className="rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="text-foreground/70">
              Rows: {summary.totalRows} of {rows.length}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="space-y-1 text-xs">
                <div className="text-foreground/70">Search</div>
                <input
                  type="search"
                  className="h-8 w-full rounded-md border bg-transparent px-2 text-xs sm:w-48"
                  value={rowSearch}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setRowSearch(e.target.value)}
                  placeholder="Name or email..."
                />
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRowSearch("")}
                disabled={!rowSearch.trim()}
              >
                Clear search
              </Button>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={deficitOnly}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setDeficitOnly(e.target.checked)}
                />
                <span className="text-foreground/70">Deficit only</span>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={inOfficeDeficitOnly}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setInOfficeDeficitOnly(e.target.checked)}
                />
                <span className="text-foreground/70">In-office deficit only</span>
              </label>
              <label className="space-y-1 text-xs">
                <div className="text-foreground/70">Min deficit (mins)</div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="h-8 w-full rounded-md border bg-transparent px-2 text-xs sm:w-28"
                  value={minDeficitMinutes}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMinDeficitMinutes(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="space-y-1 text-xs">
                <div className="text-foreground/70">Min in-office (mins)</div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="h-8 w-full rounded-md border bg-transparent px-2 text-xs sm:w-28"
                  value={minInOfficeDeficitMinutes}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMinInOfficeDeficitMinutes(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="space-y-1 text-xs">
                <div className="text-foreground/70">Sort</div>
                <select
                  className="h-8 w-full rounded-md border bg-transparent px-2 text-xs sm:w-44"
                  value={sortKey}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setSortKey(e.target.value as "name" | "total" | "deficit" | "deficit_in_office")
                  }
                >
                  <option value="name">Name (A-Z)</option>
                  <option value="total">Total (high to low)</option>
                  <option value="deficit">Deficit (high to low)</option>
                  <option value="deficit_in_office">In-office deficit (high to low)</option>
                </select>
              </label>
              <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!filtersActive}>
                Reset filters
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-foreground/70">
            <span>Deficit: {summary.deficitCount}</span>
            <span>Total deficit: {formatMinutes(summary.totalDeficit)}</span>
            <span>In-office deficit: {summary.inOfficeDeficitCount}</span>
            <span>In-office total: {formatMinutes(summary.totalInOfficeDeficit)}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopyEmails("all")}
              disabled={summary.totalRows === 0}
            >
              Copy emails
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopyEmails("deficit")}
              disabled={summary.totalRows === 0}
            >
              Copy deficit emails
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCopyEmails("in_office_deficit")}
              disabled={summary.totalRows === 0}
            >
              Copy in-office deficit emails
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadFilteredCsv}
              disabled={summary.totalRows === 0}
            >
              Download filtered CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-t bg-foreground/5 text-left text-xs text-foreground/70">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">In office</th>
                  <th className="px-3 py-2 text-right">Deficit</th>
                  <th className="px-3 py-2 text-right">Deficit in-office</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((r) => {
                  const deficit = parseMinutesValue(r.deficit_minutes) ?? 0;
                  const inOfficeDeficit = parseMinutesValue(r.deficit_in_office_minutes) ?? 0;
                  const highlight = deficit > 0 || inOfficeDeficit > 0;
                  return (
                    <tr key={`${r.user_id}:${r.week_start}`} className={highlight ? "bg-red-500/5" : undefined}>
                    <td className="px-3 py-2">{r.display_name || "—"}</td>
                    <td className="px-3 py-2">{r.email || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.total_minutes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.in_office_minutes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.deficit_minutes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.deficit_in_office_minutes)}</td>
                  </tr>
                  );
                })}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-foreground/60" colSpan={6}>
                      {filtersActive ? "No rows match the current filters." : "No rows returned."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

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

export function OfficeHoursExportPanel({ initialWeekStart }: { initialWeekStart: string | null }) {
  const [anchorDate, setAnchorDate] = useState<string>(() => normalizeDateOnlyString(initialWeekStart) ?? todayDateString());
  const [rows, setRows] = useState<AdminWeeklyHoursPreviewRow[] | null>(null);
  const [status, setStatus] = useState<string>("");

  const weekStartResolved = useMemo(
    () => startOfWeekMondayDateOnly(anchorDate) ?? startOfWeekMondayDateOnly(todayDateString()),
    [anchorDate],
  );

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

  function downloadCsv() {
    const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}` : "";
    window.location.href = `/api/admin/office-hours/export-week${qs}`;
  }

  function openCsvRaw() {
    const qs = weekStartResolved
      ? `?weekStart=${encodeURIComponent(weekStartResolved)}&disposition=inline`
      : "?disposition=inline";
    window.open(`/api/admin/office-hours/export-week${qs}`, "_blank", "noopener,noreferrer");
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
            <Button variant="outline" onClick={openCsvRaw}>
              Open CSV
            </Button>
            <Button onClick={downloadCsv}>Download CSV</Button>
          </div>
        </div>
      </div>

      {status ? (
        <div className="rounded-md border px-3 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      {rows ? (
        <div className="rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="text-foreground/70">Rows: {rows.length}</div>
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
                {rows.map((r) => (
                  <tr key={`${r.user_id}:${r.week_start}`}>
                    <td className="px-3 py-2">{r.display_name || "—"}</td>
                    <td className="px-3 py-2">{r.email || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.total_minutes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.in_office_minutes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.deficit_minutes)}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.deficit_in_office_minutes)}</td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-foreground/60" colSpan={6}>
                      No rows returned.
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

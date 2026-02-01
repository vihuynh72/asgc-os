"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = (body as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return res.text();
}

function parseCsvLinewise(input: string): string[][] {
  // Minimal RFC 4180-ish parser: handles commas + quoted fields + escaped quotes.
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 0 && field.length === 0) return;
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === "\"") {
        const next = input[i + 1];
        if (next === "\"") {
          field += "\"";
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushRow();
      continue;
    }

    if (ch === "\r") {
      // Ignore CR (support CRLF).
      continue;
    }

    field += ch;
  }

  pushRow();
  return rows;
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

export function OfficeHoursCsvPanel({ initialWeekStart }: { initialWeekStart: string | null }) {
  const [anchorDate, setAnchorDate] = useState<string>(() => normalizeDateOnlyString(initialWeekStart) ?? todayDateString());
  const [csvText, setCsvText] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [actionStatus, setActionStatus] = useState<string>("");
  const actionTimerRef = useRef<number | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "raw">("table");
  const [search, setSearch] = useState<string>("");

  const weekStartResolved = useMemo(
    () => startOfWeekMondayDateOnly(anchorDate) ?? startOfWeekMondayDateOnly(todayDateString()),
    [anchorDate],
  );

  const parsed = useMemo(() => {
    const text = csvText.trim();
    if (!text) return { headers: [] as string[], rows: [] as string[][] };
    const all = parseCsvLinewise(text);
    const headers = all[0] ?? [];
    const rows = all.slice(1);
    return { headers, rows };
  }, [csvText]);

  const headerIndex = useMemo(() => {
    const idx = new Map<string, number>();
    parsed.headers.forEach((h, i) => idx.set(h, i));
    return idx;
  }, [parsed.headers]);

  const displayHeaders = useMemo(() => {
    // Hide noisy identifiers in the UI table, while keeping them in the actual CSV download.
    const hidden = new Set(["user_id", "week_start"]);
    return parsed.headers.filter((h) => !hidden.has(h));
  }, [parsed.headers]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parsed.rows;
    return parsed.rows.filter((r) => r.join(" ").toLowerCase().includes(q));
  }, [parsed.rows, search]);

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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading CSV…");
      try {
        const qs = weekStartResolved
          ? `?weekStart=${encodeURIComponent(weekStartResolved)}&format=csv`
          : "?format=csv";
        const text = await fetchText(`/api/admin/office-hours/export-week${qs}`);
        if (cancelled) return;
        setCsvText(text);
        setStatus("");
      } catch (e) {
        if (cancelled) return;
        setStatus(e instanceof Error ? e.message : "Failed to load CSV");
        setCsvText("");
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

  function openTableView() {
    const qs = weekStartResolved ? `?weekStart=${encodeURIComponent(weekStartResolved)}` : "";
    window.open(`/admin/office-hours/export${qs}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Week starts {weekStartResolved ?? "—"}</div>
            <div className="text-xs text-foreground/70">
              Table view is for readability. Download CSV for spreadsheets.
            </div>
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

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Search</div>
              <input
                className="h-9 w-56 rounded-md border bg-transparent px-2 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or email…"
              />
            </label>

            <Button variant="outline" onClick={openTableView}>
              Open table view
            </Button>
            <Button variant="outline" onClick={() => window.location.assign("/admin/office-hours")}>
              Calendar view
            </Button>
            <Button variant="outline" onClick={copyCsv}>
              Copy CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => setViewMode((v) => (v === "table" ? "raw" : "table"))}
            >
              {viewMode === "table" ? "Raw" : "Table"}
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

      {viewMode === "raw" ? (
        <div className="rounded-md border p-3">
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-all text-xs">{csvText || "—"}</pre>
        </div>
      ) : (
        <div className="rounded-md border">
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-xs text-foreground/70">
            <div>
              {filteredRows.length} row{filteredRows.length === 1 ? "" : "s"}
              {search.trim() ? ` (filtered)` : ""}
            </div>
            <div className="font-mono">{parsed.headers.join(" • ")}</div>
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b">
                  {displayHeaders.map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-foreground/70">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-xs text-foreground/60" colSpan={Math.max(1, displayHeaders.length)}>
                      No rows.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r, idx) => (
                    <tr key={idx} className={cn("border-b last:border-b-0", idx % 2 === 1 && "bg-muted/20")}>
                      {displayHeaders.map((h) => {
                        const i = headerIndex.get(h) ?? -1;
                        const v = i >= 0 ? (r[i] ?? "") : "";
                        const isMinutes = h.endsWith("_minutes");
                        return (
                          <td key={h} className={cn("px-3 py-2 align-top", isMinutes && "font-mono")}>
                            {v}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

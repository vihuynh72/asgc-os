"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { addDaysDateOnly, normalizeDateOnlyString, todayDateString } from "@/lib/dateOnly";

type ReviewSession = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  office_location_name?: string;
  checkin_at: string;
  checkout_at: string | null;
  status: string;
  within_radius?: boolean | null;
  within_grace?: boolean | null;
  distance_m_at_checkin?: number | null;
  quarantined_at?: string | null;
  quarantine_reason?: string | null;
};

function formatWhen(iso: string, timeZone: string | null): string {
  try {
    const d = new Date(iso);
    if (!timeZone) return d.toLocaleString();
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return iso;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export function KioskPhotoReviewPanel() {
  const [startDate, setStartDate] = useState<string>(() => addDaysDateOnly(todayDateString(), -7) ?? todayDateString());
  const [endDate, setEndDate] = useState<string>(() => addDaysDateOnly(todayDateString(), 1) ?? todayDateString());
  const [status, setStatus] = useState<string>("");
  const [sessions, setSessions] = useState<ReviewSession[]>([]);
  const [search, setSearch] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [photoUrlById, setPhotoUrlById] = useState<Map<string, string>>(() => new Map());
  const [actionStatus, setActionStatus] = useState<string>("");
  const actionTimerRef = useRef<number | null>(null);
  const [tz, setTz] = useState<string | null>(null);
  const [mode, setMode] = useState<"active" | "quarantine">("active");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkReason, setBulkReason] = useState<string>("");

  const startResolved = useMemo(() => normalizeDateOnlyString(startDate) ?? todayDateString(), [startDate]);
  const endResolved = useMemo(() => normalizeDateOnlyString(endDate) ?? addDaysDateOnly(todayDateString(), 1) ?? todayDateString(), [endDate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading sessions…");
      try {
        const params = new URLSearchParams({ startDate: startResolved, endDate: endResolved, mode });
        const data = await fetchJson<{ tz: string; sessions: ReviewSession[]; mode?: string }>(`/api/office-hours/kiosk/review/sessions?${params.toString()}`);
        if (cancelled) return;
        setTz(data.tz || null);
        setSessions(data.sessions ?? []);
        setSelectedIds(new Set());
        setStatus("");
      } catch (e) {
        if (cancelled) return;
        setSessions([]);
        setStatus(e instanceof Error ? e.message : "Failed to load sessions");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [endResolved, mode, startResolved]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => `${s.user_display_name} ${s.user_email} ${s.status} ${s.office_location_name ?? ""}`.toLowerCase().includes(q));
  }, [search, sessions]);

  const selectedCount = selectedIds.size;
  const allChecked = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));

  async function togglePhoto(sessionId: string) {
    if (expandedId === sessionId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(sessionId);
    if (photoUrlById.has(sessionId)) return;

    try {
      const params = new URLSearchParams({ sessionId });
      const data = await fetchJson<{ url: string; expiresInSeconds: number }>(`/api/office-hours/kiosk/review/photo?${params.toString()}`);
      setPhotoUrlById((prev) => {
        const next = new Map(prev);
        next.set(sessionId, data.url);
        return next;
      });
    } catch (e) {
      setTransientActionStatus(e instanceof Error ? e.message : "Failed to load photo");
      setExpandedId(null);
    }
  }

  async function quarantineOne(sessionId: string, reason: string | undefined) {
    try {
      await fetchJson<{ ok: true }>("/api/office-hours/kiosk/review/quarantine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, reason: reason?.trim() ? reason.trim() : undefined }),
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      setTransientActionStatus("Quarantined.");
    } catch (e) {
      setTransientActionStatus(e instanceof Error ? e.message : "Failed to quarantine");
    }
  }

  async function restoreOne(sessionId: string) {
    try {
      await fetchJson<{ ok: true }>("/api/office-hours/kiosk/review/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      setTransientActionStatus("Restored.");
    } catch (e) {
      setTransientActionStatus(e instanceof Error ? e.message : "Failed to restore");
    }
  }

  async function bulkAction() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setTransientActionStatus(mode === "active" ? `Quarantining ${ids.length}…` : `Restoring ${ids.length}…`);
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      if (mode === "active") await quarantineOne(id, bulkReason);
      // eslint-disable-next-line no-await-in-loop
      else await restoreOne(id);
    }
    setBulkReason("");
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Kiosk selfies</div>
            <div className="text-xs text-foreground/70">Only allowlisted members are shown. {tz ? `Times shown in ${tz}.` : ""}</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-full border bg-background/60">
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-medium ${mode === "active" ? "bg-foreground/5" : "text-foreground/70 hover:bg-foreground/5"}`}
                onClick={() => setMode("active")}
              >
                Active
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs font-medium ${mode === "quarantine" ? "bg-foreground/5" : "text-foreground/70 hover:bg-foreground/5"}`}
                onClick={() => setMode("quarantine")}
              >
                Quarantine
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 border-t pt-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Start</div>
              <input
                type="date"
                className="h-9 w-44 rounded-md border bg-transparent px-2 text-sm"
                value={startResolved}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setStartDate(normalizeDateOnlyString(e.target.value) ?? todayDateString())}
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">End</div>
              <input
                type="date"
                className="h-9 w-44 rounded-md border bg-transparent px-2 text-sm"
                value={endResolved}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEndDate(normalizeDateOnlyString(e.target.value) ?? todayDateString())}
              />
            </label>
            <Button variant="outline" size="sm" onClick={() => {
              setStartDate(addDaysDateOnly(todayDateString(), -7) ?? todayDateString());
              setEndDate(addDaysDateOnly(todayDateString(), 1) ?? todayDateString());
            }}>
              Last 7 days
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              setStartDate(addDaysDateOnly(todayDateString(), -30) ?? todayDateString());
              setEndDate(addDaysDateOnly(todayDateString(), 1) ?? todayDateString());
            }}>
              Last 30 days
            </Button>
          </div>

          <div className="flex items-end justify-between gap-2">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Search</div>
              <input
                type="text"
                className="h-9 w-72 rounded-md border bg-transparent px-2 text-sm"
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                placeholder="Search name, email, location..."
              />
            </label>
            <div className="text-xs text-foreground/70">
              {filtered.length} session{filtered.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <label className="flex items-center gap-2 text-xs text-foreground/70">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => {
                if (e.target.checked) setSelectedIds(new Set(filtered.map((s) => s.id)));
                else setSelectedIds(new Set());
              }}
            />
            Select all
          </label>

          <div className="flex flex-wrap items-center gap-2">
            {mode === "active" ? (
              <input
                type="text"
                className="h-9 w-56 rounded-md border bg-transparent px-2 text-sm"
                value={bulkReason}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBulkReason(e.target.value)}
                placeholder="Quarantine reason (optional)"
              />
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void bulkAction()}
              disabled={selectedCount === 0}
            >
              {mode === "active" ? `Quarantine (${selectedCount})` : `Restore (${selectedCount})`}
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedCount === 0}>
              Clear
            </Button>
          </div>
        </div>
      </div>

      {actionStatus ? <div className="text-xs text-foreground/70">{actionStatus}</div> : null}
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      <div className="space-y-3">
        {filtered.map((s) => {
          const expanded = expandedId === s.id;
          const photoUrl = photoUrlById.get(s.id) ?? null;
          const checked = selectedIds.has(s.id);
          return (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="flex items-start gap-3 min-w-0">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        return next;
                      });
                    }}
                  />
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.user_display_name || "—"}</div>
                  <div className="text-xs text-foreground/60 truncate">{s.user_email}</div>
                  <div className="mt-1 text-xs text-foreground/70">
                    Check-in: <span className="font-mono">{formatWhen(s.checkin_at, tz)}</span>
                    {s.checkout_at ? (
                      <>
                        {" "}• Check-out: <span className="font-mono">{formatWhen(s.checkout_at, tz)}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-foreground/70">
                      {s.status.replace("_", " ")}
                    </span>
                    {typeof s.distance_m_at_checkin === "number" ? (
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-foreground/70">
                        {s.distance_m_at_checkin}m
                      </span>
                    ) : null}
                    {s.within_radius === false ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Outside
                      </span>
                    ) : null}
                    {s.office_location_name ? (
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-foreground/70">
                        {s.office_location_name}
                      </span>
                    ) : null}
                    {mode === "quarantine" && s.quarantined_at ? (
                      <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-foreground/70">
                        Quarantined {formatWhen(s.quarantined_at, tz)}
                      </span>
                    ) : null}
                  </div>
                </div>
                </label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void togglePhoto(s.id)}>
                    {expanded ? "Hide selfie" : "View selfie"}
                  </Button>
                  {mode === "active" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const reason = window.prompt("Quarantine reason (optional):", "");
                        void quarantineOne(s.id, reason ?? undefined);
                      }}
                    >
                      Quarantine
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void restoreOne(s.id)}>
                      Restore
                    </Button>
                  )}
                </div>
              </div>
              {expanded ? (
                <div className="mt-3">
                  {photoUrl ? (
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => window.open(photoUrl, "_blank", "noopener,noreferrer")}>
                        Open full
                      </Button>
                    </div>
                  ) : null}
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt="Kiosk check-in selfie"
                      className="w-full max-w-4xl max-h-[70vh] rounded-xl border bg-black/5 object-contain shadow-sm cursor-zoom-in"
                      loading="lazy"
                      onClick={() => window.open(photoUrl, "_blank", "noopener,noreferrer")}
                    />
                  ) : (
                    <div className="text-sm text-foreground/70">Loading selfie…</div>
                  )}
                  <div className="mt-2 text-xs text-foreground/60">
                    Links expire after a few minutes. If the image fails to load, close and reopen.
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {filtered.length === 0 ? (
          <div className="rounded-md border p-6 text-center text-sm text-foreground/60">
            {mode === "active" ? "No active kiosk selfies found for this range." : "No quarantined kiosk selfies found for this range."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

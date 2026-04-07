"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { KioskNotice, KioskStatusChip } from "@/components/office-hours/kiosk";
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

export function KioskPhotoReviewPanel({ canEdit = false }: { canEdit?: boolean }) {
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
      if (mode === "active") await quarantineOne(id, bulkReason);
      else await restoreOne(id);
    }
    setBulkReason("");
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-4">
      <section className="kiosk-section space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--admin-label)]">
              Review queue
            </p>
            <p className="text-sm text-foreground/75">
              {tz ? `Times in ${tz}` : "Times in local timezone"}
            </p>
          </div>

          <div className="inline-flex overflow-hidden rounded-full border border-[var(--admin-border-soft)] bg-white/70">
            <button
              type="button"
              className={`h-11 px-4 text-sm font-medium ${
                mode === "active" ? "bg-white text-foreground" : "text-foreground/65 hover:bg-white/70"
              }`}
              onClick={() => setMode("active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`h-11 px-4 text-sm font-medium ${
                mode === "quarantine"
                  ? "bg-white text-foreground"
                  : "text-foreground/65 hover:bg-white/70"
              }`}
              onClick={() => setMode("quarantine")}
            >
              Quarantine
            </button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="kiosk-control-label">Start</span>
              <input
                type="date"
                className="kiosk-input h-12 rounded-xl px-3 text-sm"
                value={startResolved}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setStartDate(
                    normalizeDateOnlyString(event.target.value) ?? todayDateString(),
                  )
                }
              />
            </label>

            <label className="space-y-1">
              <span className="kiosk-control-label">End</span>
              <input
                type="date"
                className="kiosk-input h-12 rounded-xl px-3 text-sm"
                value={endResolved}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setEndDate(
                    normalizeDateOnlyString(event.target.value) ?? todayDateString(),
                  )
                }
              />
            </label>

            <div className="flex gap-2 sm:col-span-2">
              <Button
                variant="outline"
                className="h-11 rounded-xl px-4"
                onClick={() => {
                  setStartDate(addDaysDateOnly(todayDateString(), -7) ?? todayDateString());
                  setEndDate(addDaysDateOnly(todayDateString(), 1) ?? todayDateString());
                }}
              >
                Last 7 days
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-xl px-4"
                onClick={() => {
                  setStartDate(addDaysDateOnly(todayDateString(), -30) ?? todayDateString());
                  setEndDate(addDaysDateOnly(todayDateString(), 1) ?? todayDateString());
                }}
              >
                Last 30 days
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="space-y-1">
              <span className="kiosk-control-label">Search</span>
              <input
                type="text"
                className="kiosk-input h-12 rounded-xl px-3 text-sm"
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                placeholder="Name, email, location"
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              <KioskStatusChip
                tone={mode === "active" ? "warning" : "neutral"}
                icon={mode === "active" ? "clock" : "dot"}
                label={mode === "active" ? "Needs review" : "Quarantined"}
                count={filtered.length}
              />
              {canEdit ? (
                <label className="flex items-center gap-2 text-xs text-foreground/65">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(event) => {
                      if (event.target.checked) setSelectedIds(new Set(filtered.map((s) => s.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                  Select all
                </label>
              ) : null}
            </div>
          </div>
        </div>

        {canEdit ? (
          <div className="grid gap-2 border-t border-[var(--admin-border-soft)] pt-3 md:grid-cols-[1fr_auto] md:items-center">
            {mode === "active" ? (
              <input
                type="text"
                className="kiosk-input h-12 rounded-xl px-3 text-sm"
                value={bulkReason}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setBulkReason(event.target.value)}
                placeholder="Quarantine reason (optional)"
              />
            ) : (
              <p className="text-xs text-foreground/65">Restore selected sessions to active review.</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="h-11 rounded-xl px-4"
                onClick={() => void bulkAction()}
                disabled={selectedCount === 0}
              >
                {mode === "active" ? `Quarantine (${selectedCount})` : `Restore (${selectedCount})`}
              </Button>
              <Button
                variant="ghost"
                className="h-11 rounded-xl px-4"
                onClick={clearSelection}
                disabled={selectedCount === 0}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-[var(--admin-border-soft)] pt-3">
            <p className="text-xs text-foreground/65">
              View-only access. Quarantine and restore actions require full admin or EVP access.
            </p>
          </div>
        )}
      </section>

      {actionStatus ? <KioskNotice tone="neutral">{actionStatus}</KioskNotice> : null}
      {status ? (
        <KioskNotice tone={status.startsWith("Loading") ? "neutral" : "warning"}>
          {status}
        </KioskNotice>
      ) : null}

      <div className="space-y-3">
        {filtered.map((s) => {
          const expanded = expandedId === s.id;
          const photoUrl = photoUrlById.get(s.id) ?? null;
          const checked = selectedIds.has(s.id);
          const statusLabel = s.status.replaceAll("_", " ");
          const tone =
            mode === "quarantine"
              ? "neutral"
              : s.within_radius === false
                ? "warning"
                : "good";

          return (
            <article key={s.id} className="kiosk-section space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex min-w-0 items-start gap-3">
                  {canEdit ? (
                    <input
                      type="checkbox"
                      className="mt-1.5"
                      checked={checked}
                      onChange={(event) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (event.target.checked) next.add(s.id);
                          else next.delete(s.id);
                          return next;
                        });
                      }}
                    />
                  ) : null}
                  <div className="min-w-0 space-y-2">
                    <div>
                      <p className="truncate text-base font-medium">{s.user_display_name || "—"}</p>
                      <p className="truncate text-xs text-foreground/65">{s.user_email}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <KioskStatusChip
                        tone={tone}
                        icon={tone === "warning" ? "triangle" : tone === "good" ? "check" : "dot"}
                        label={statusLabel}
                      />
                      {typeof s.distance_m_at_checkin === "number" ? (
                        <KioskStatusChip tone="neutral" icon="dot" label={`${s.distance_m_at_checkin}m`} />
                      ) : null}
                      {s.office_location_name ? (
                        <KioskStatusChip tone="neutral" icon="dot" label={s.office_location_name} />
                      ) : null}
                      {mode === "quarantine" && s.quarantined_at ? (
                        <KioskStatusChip
                          tone="neutral"
                          icon="clock"
                          label={`Quarantined ${formatWhen(s.quarantined_at, tz)}`}
                        />
                      ) : null}
                    </div>

                    <p className="text-xs text-foreground/65">
                      In {formatWhen(s.checkin_at, tz)}
                      {s.checkout_at ? ` • Out ${formatWhen(s.checkout_at, tz)}` : ""}
                    </p>
                  </div>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl px-3"
                    onClick={() => void togglePhoto(s.id)}
                  >
                    {expanded ? "Hide selfie" : "View selfie"}
                  </Button>
                  {canEdit && mode === "active" ? (
                    <Button
                      variant="outline"
                      className="h-10 rounded-xl px-3"
                      onClick={() => {
                        const reason = window.prompt("Quarantine reason (optional):", "");
                        void quarantineOne(s.id, reason ?? undefined);
                      }}
                    >
                      Quarantine
                    </Button>
                  ) : null}
                  {canEdit && mode !== "active" ? (
                    <Button
                      variant="outline"
                      className="h-10 rounded-xl px-3"
                      onClick={() => void restoreOne(s.id)}
                    >
                      Restore
                    </Button>
                  ) : null}
                </div>
              </div>

              {expanded ? (
                <div className="space-y-2 border-t border-[var(--admin-border-soft)] pt-3">
                  {photoUrl ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-10 rounded-xl px-3"
                        onClick={() => window.open(photoUrl, "_blank", "noopener,noreferrer")}
                      >
                        Open full
                      </Button>
                    </div>
                  ) : null}

                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt="Kiosk check-in selfie"
                      className="max-h-[70vh] w-full max-w-4xl cursor-zoom-in rounded-xl border border-[var(--admin-border-soft)] bg-black/5 object-contain shadow-sm"
                      loading="lazy"
                      onClick={() => window.open(photoUrl, "_blank", "noopener,noreferrer")}
                    />
                  ) : (
                    <p className="text-sm text-foreground/65">Loading selfie…</p>
                  )}
                  <p className="text-xs text-foreground/55">Image links expire quickly. Reopen if needed.</p>
                </div>
              ) : null}
            </article>
          );
        })}

        {filtered.length === 0 ? (
          <section className="kiosk-section p-8 text-center">
            <p className="text-sm text-foreground/65">
              {mode === "active" ? "No active selfies in this range." : "No quarantined selfies in this range."}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

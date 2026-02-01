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
  checkin_at: string;
  checkout_at: string | null;
  status: string;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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

  const startResolved = useMemo(() => normalizeDateOnlyString(startDate) ?? todayDateString(), [startDate]);
  const endResolved = useMemo(() => normalizeDateOnlyString(endDate) ?? addDaysDateOnly(todayDateString(), 1) ?? todayDateString(), [endDate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("Loading sessions…");
      try {
        const params = new URLSearchParams({ startDate: startResolved, endDate: endResolved });
        const data = await fetchJson<{ tz: string; sessions: ReviewSession[] }>(`/api/office-hours/kiosk/review/sessions?${params.toString()}`);
        if (cancelled) return;
        setSessions(data.sessions ?? []);
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
  }, [endResolved, startResolved]);

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
    return sessions.filter((s) => `${s.user_display_name} ${s.user_email} ${s.status}`.toLowerCase().includes(q));
  }, [search, sessions]);

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

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Filters</div>
            <div className="text-xs text-foreground/70">Only allowlisted members are shown.</div>
          </div>

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
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t pt-3">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Search</div>
            <input
              type="text"
              className="h-9 w-72 rounded-md border bg-transparent px-2 text-sm"
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Search name or email..."
            />
          </label>
          <div className="text-xs text-foreground/70">
            {filtered.length} session{filtered.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {actionStatus ? <div className="text-xs text-foreground/70">{actionStatus}</div> : null}
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      <div className="space-y-3">
        {filtered.map((s) => {
          const expanded = expandedId === s.id;
          const photoUrl = photoUrlById.get(s.id) ?? null;
          return (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.user_display_name || "—"}</div>
                  <div className="text-xs text-foreground/60 truncate">{s.user_email}</div>
                  <div className="mt-1 text-xs text-foreground/70">
                    Check-in: <span className="font-mono">{formatWhen(s.checkin_at)}</span>
                    {s.checkout_at ? (
                      <>
                        {" "}
                        • Check-out: <span className="font-mono">{formatWhen(s.checkout_at)}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-foreground/70">
                    {s.status.replace("_", " ")}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void togglePhoto(s.id)}>
                    {expanded ? "Hide selfie" : "View selfie"}
                  </Button>
                </div>
              </div>
              {expanded ? (
                <div className="mt-3">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt="Kiosk check-in selfie"
                      className="w-full max-w-lg rounded-md border"
                      loading="lazy"
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
            No kiosk selfies found for this range.
          </div>
        ) : null}
      </div>
    </div>
  );
}


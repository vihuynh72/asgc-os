"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type WeeklyHours = {
  week_start: string;
  total_minutes: number;
  in_office_minutes: number;
  deficit_minutes: number;
  deficit_in_office_minutes: number;
};

type OpenSession = {
  id: string;
  checkin_at: string;
  office_location_id: string | null;
  needs_review: boolean;
  review_reason: string | null;
};

function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${minutesPart}m`;
}

function friendlyError(message: string): string {
  switch (message) {
    case "location_required":
      return "Location is required to check in/out.";
    case "pin_required":
      return "PIN is required to check in.";
    case "invalid_pin":
      return "Invalid or expired PIN. Try again.";
    case "outside_geofence":
      return "You appear to be outside the allowed office area.";
    case "already_checked_in":
      return "You already have an open session.";
    case "no_open_session":
      return "No open session found to check out.";
    case "office_location_not_configured":
      return "Office location is not fully configured yet (lat/lon/radii missing).";
    default:
      return message || "Something went wrong.";
  }
}

async function getCurrentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      (err) => {
        reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

export default function OfficeHoursPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [pin, setPin] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weekly, setWeekly] = useState<WeeklyHours | null>(null);
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);

  const refresh = useCallback(async () => {
    setError(null);

    const { data: weeklyData, error: weeklyError } = await supabase.rpc("my_weekly_hours");
    if (weeklyError) {
      setError(weeklyError.message);
    } else {
      const row = Array.isArray(weeklyData) ? weeklyData[0] : weeklyData;
      if (row) setWeekly(row as WeeklyHours);
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("office_hour_sessions")
      .select("id,checkin_at,office_location_id,needs_review,review_reason")
      .eq("status", "open")
      .is("checkout_at", null)
      .order("checkin_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      setError(sessionError.message);
    } else {
      setOpenSession((sessionRow as OpenSession | null) ?? null);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCheckIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { lat, lon } = await getCurrentPosition();
      const res = await fetch("/api/office-hours/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon, pin }),
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(friendlyError(json?.error ?? ""));
        return;
      }

      await refresh();
    } catch {
      setError("Location permission denied or unavailable.");
    } finally {
      setLoading(false);
    }
  }, [pin, refresh]);

  const onCheckOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { lat, lon } = await getCurrentPosition();
      const res = await fetch("/api/office-hours/check-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon, pin: pin.trim().length > 0 ? pin : undefined }),
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(friendlyError(json?.error ?? ""));
        return;
      }

      await refresh();
    } catch {
      setError("Location permission denied or unavailable.");
    } finally {
      setLoading(false);
    }
  }, [pin, refresh]);

  return (
    <PageShell title="Office Hours" description="Check in/out with location + rotating PIN.">
      <div className="space-y-6">
        <div className="rounded-lg border border-foreground/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">Status</div>
              {openSession ? (
                <div className="text-sm text-foreground/80">
                  Checked in at {new Date(openSession.checkin_at).toLocaleString()}
                  {openSession.needs_review ? (
                    <span className="ml-2 text-foreground/70">(needs review)</span>
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-foreground/80">Not checked in</div>
              )}
              {openSession?.review_reason ? (
                <div className="text-xs text-foreground/70">Reason: {openSession.review_reason}</div>
              ) : null}
            </div>

            <div className="w-full sm:w-80">
              <label className="block text-sm font-medium" htmlFor="pin">
                PIN
              </label>
              <input
                id="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                inputMode="numeric"
                className="mt-1 w-full rounded-md border border-foreground/10 bg-transparent px-3 py-2 text-sm"
                placeholder="Enter kiosk PIN"
              />
              <div className="mt-2 text-xs text-foreground/60">
                Check-in requires a PIN. Check-out PIN is optional.
              </div>
            </div>
          </div>

          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          <div className="mt-4 flex gap-2">
            <Button onClick={onCheckIn} disabled={loading || !!openSession}>
              Check In
            </Button>
            <Button variant="ghost" onClick={onCheckOut} disabled={loading || !openSession}>
              Check Out
            </Button>
            <Button variant="ghost" onClick={refresh} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-foreground/10 p-4">
          <div className="text-sm font-medium">This Week</div>
          {weekly ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="text-sm text-foreground/80">
                Total: {formatMinutes(weekly.total_minutes)}
              </div>
              <div className="text-sm text-foreground/80">
                In-office: {formatMinutes(weekly.in_office_minutes)}
              </div>
              <div className="text-sm text-foreground/80">
                Total deficit: {formatMinutes(weekly.deficit_minutes)}
              </div>
              <div className="text-sm text-foreground/80">
                In-office deficit: {formatMinutes(weekly.deficit_in_office_minutes)}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-foreground/70">Loading…</div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

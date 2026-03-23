"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { normalizeDateOnlyString } from "@/lib/dateOnly";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type WeeklyHours = {
  week_start: string;
  total_minutes: number;
  deficit_minutes: number;
};

type TimesheetSession = {
  id: string;
  checkin_at: string;
  checkout_at: string | null;
  status: string;
  duration_minutes: number | null;
  within_radius: boolean;
  within_grace: boolean;
  distance_m_at_checkin?: number | null;
  distance_m_at_checkout?: number | null;
};

type TimesheetException = {
  id: string;
  kind: "total";
  minutes: number;
  reason: string | null;
  created_at: string;
};

type OfficeHourShift = {
  id: string;
  office_location_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  covered_by_user_id: string | null;
};

type CoverageRequest = {
  id: string;
  shift_id: string;
  requestor_user_id: string;
  claimer_user_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  claimed_at: string | null;
};

type OfficeConfig = {
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string;
  quiet_hours_end_local: string;
};

type OpenSession = {
  id: string;
  checkin_at: string;
  office_location_id: string | null;
  requires_presence: boolean;
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
    case "outside_geofence":
      return "You appear to be outside the allowed office area.";
    case "already_checked_in":
      return "You already have an open session.";
    case "no_open_session":
      return "No open session found to check out.";
    case "office_location_not_configured":
      return "Office location is not fully configured yet (lat/lon/radii missing).";
    case "weekend_not_allowed":
      return "Office hours aren’t enabled today.";
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

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return Math.round(r * c);
}

function todayDateString(): string {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateUtcNoon(dateStr: string): Date | null {
  const iso = normalizeDateOnlyString(dateStr);
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string | null {
  const d = parseDateUtcNoon(dateStr);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateUtc(d);
}

function startOfWeekMonday(dateStr: string): string | null {
  const d = parseDateUtcNoon(dateStr);
  if (!d) return null;
  const day = d.getUTCDay(); // 0=Sun
  const daysSinceMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return formatDateUtc(d);
}

function dateKeyInTz(iso: string, timeZone: string | null): string {
  const d = new Date(iso);
  if (!timeZone) return iso.slice(0, 10);

  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export default function OfficeHoursPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [weekly, setWeekly] = useState<WeeklyHours | null>(null);
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [sessions, setSessions] = useState<TimesheetSession[]>([]);
  const [exceptions, setExceptions] = useState<TimesheetException[]>([]);
  const [shifts, setShifts] = useState<OfficeHourShift[]>([]);
  const [openCoverageRequests, setOpenCoverageRequests] = useState<CoverageRequest[]>([]);
  const [officeTz, setOfficeTz] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [weekAnchorDate, setWeekAnchorDate] = useState<string>(() => todayDateString());
  const [officeConfig, setOfficeConfig] = useState<OfficeConfig | null>(null);
  const [quietHoursActive, setQuietHoursActive] = useState<boolean | null>(null);
  const [officeLocationName, setOfficeLocationName] = useState<string | null>(null);
  const [coverageNotesByShiftId, setCoverageNotesByShiftId] = useState<Record<string, string>>({});
  const [canViewKioskSelfies, setCanViewKioskSelfies] = useState<boolean>(false);

  const [officeGeo, setOfficeGeo] = useState<{
    lat: number;
    lon: number;
    radiusM: number;
    graceRadiusM: number;
  } | null>(null);
  const [officeGeoStatus, setOfficeGeoStatus] = useState<"loading" | "ready" | "not_configured">("loading");

  const [autoPresenceEnabled, setAutoPresenceEnabled] = useState(true);
  const [lastPresenceCheckAt, setLastPresenceCheckAt] = useState<string | null>(null);
  const [lastDistanceM, setLastDistanceM] = useState<number | null>(null);
  const [lastDistanceBand, setLastDistanceBand] = useState<"in_radius" | "in_grace" | "outside_grace" | null>(
    null,
  );

  const presenceCheckLockRef = useRef(false);
  const [clock, setClock] = useState(() => Date.now());

  const formatInOfficeTz = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (!officeTz) return d.toLocaleString();

      return new Intl.DateTimeFormat(undefined, {
        timeZone: officeTz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    },
    [officeTz],
  );

  const selectedWeekStart = useMemo(() => startOfWeekMonday(weekAnchorDate) ?? startOfWeekMonday(todayDateString()), [weekAnchorDate]);
  const selectedWeekDays = useMemo(() => {
    if (!selectedWeekStart) return [];
    const out: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const d = addDays(selectedWeekStart, i);
      if (d) out.push(d);
    }
    return out;
  }, [selectedWeekStart]);

  const sessionsByDay = useMemo(() => {
    const m = new Map<string, TimesheetSession[]>();
    for (const s of sessions) {
      const key = dateKeyInTz(s.checkin_at, officeTz);
      const arr = m.get(key);
      if (arr) arr.push(s);
      else m.set(key, [s]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => Date.parse(a.checkin_at) - Date.parse(b.checkin_at));
    }
    return m;
  }, [officeTz, sessions]);

  const shiftsById = useMemo(() => {
    const m = new Map<string, OfficeHourShift>();
    for (const shift of shifts) {
      m.set(shift.id, shift);
    }
    return m;
  }, [shifts]);

  const coverageByShiftId = useMemo(() => {
    const m = new Map<string, CoverageRequest>();
    for (const request of openCoverageRequests) {
      m.set(request.shift_id, request);
    }
    return m;
  }, [openCoverageRequests]);

  const weeklySummary = useMemo(() => {
    if (!weekly) return null;
    const requiredTotalMinutes = Math.max(weekly.total_minutes + weekly.deficit_minutes, 0);
    const totalProgress = requiredTotalMinutes > 0 ? Math.min(weekly.total_minutes / requiredTotalMinutes, 1) : 0;
    return {
      requiredTotalMinutes,
      totalProgress,
    };
  }, [weekly]);

  const refresh = useCallback(async () => {
    setError(null);
    setNotice(null);

    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) setUserId(userData.user.id);

    const { data: tzData, error: tzErr } = await supabase.rpc("office_timezone");
    if (!tzErr && typeof tzData === "string" && tzData.length > 0) {
      setOfficeTz(tzData);
    }

    const quietRes = await supabase.rpc("is_quiet_hours");
    if (!quietRes.error && typeof quietRes.data === "boolean") {
      setQuietHoursActive(quietRes.data);
    }

    const canViewRes = await supabase.rpc("can_view_office_hours_photos");
    if (!canViewRes.error) {
      setCanViewKioskSelfies(!!canViewRes.data);
    }

    const weekStart = selectedWeekStart || undefined;

    try {
      const qs = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
      const res = await fetch(`/api/office-hours/timesheet${qs}`);
      const json = (await res.json().catch(() => null)) as
        | { error?: string; weekly?: WeeklyHours | null; sessions?: TimesheetSession[]; exceptions?: TimesheetException[] }
        | null;

      if (!res.ok) {
        setError(json?.error ?? "Failed to load timesheet");
      } else {
        setWeekly((json?.weekly as WeeklyHours | null) ?? null);
        setSessions(((json?.sessions ?? []) as TimesheetSession[]) || []);
        setExceptions(((json?.exceptions ?? []) as TimesheetException[]) || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timesheet");
    }

    const { data: sessionRow, error: sessionError } = await supabase
      .from("office_hour_sessions")
      .select("id,checkin_at,office_location_id,requires_presence")
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

    try {
      const qs = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
      const shiftsRes = await fetch(`/api/office-hours/shifts${qs}`);
      const shiftsJson = (await shiftsRes.json().catch(() => null)) as { error?: string; shifts?: OfficeHourShift[] } | null;
      if (shiftsRes.ok) {
        setShifts(((shiftsJson?.shifts ?? []) as OfficeHourShift[]) || []);
      } else {
        setError(shiftsJson?.error ?? "Failed to load shifts");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shifts");
    }

    // Fetch open coverage requests
    const coverageRes = await fetch("/api/office-hours/coverage");
    if (coverageRes.ok) {
      const coverageJson = (await coverageRes.json().catch(() => null)) as { requests?: CoverageRequest[] } | null;
      setOpenCoverageRequests((coverageJson?.requests ?? []) as CoverageRequest[]);
    } else {
      const coverageJson = (await coverageRes.json().catch(() => null)) as { error?: string } | null;
      setError(coverageJson?.error ?? "Failed to load coverage requests");
    }
  }, [selectedWeekStart, supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem("officeHours.autoPresenceEnabled");
      if (v === "0") setAutoPresenceEnabled(false);
    } catch {
      // Ignore storage errors (private mode, etc.)
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("officeHours.autoPresenceEnabled", autoPresenceEnabled ? "1" : "0");
    } catch {
      // Ignore
    }
  }, [autoPresenceEnabled]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setOfficeGeoStatus("loading");
      const { data: config, error: cfgErr } = await supabase
        .from("office_config")
        .select("primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local")
        .eq("id", true)
        .maybeSingle();

      if (cancelled) return;
      if (cfgErr || !config) {
        setOfficeGeo(null);
        setOfficeGeoStatus("not_configured");
        return;
      }

      setOfficeConfig({
        quiet_hours_enabled: config.quiet_hours_enabled,
        quiet_hours_start_local: config.quiet_hours_start_local,
        quiet_hours_end_local: config.quiet_hours_end_local,
      });

      if (!config.primary_office_location_id) {
        setOfficeGeo(null);
        setOfficeGeoStatus("not_configured");
        return;
      }

      const { data: office, error: officeErr } = await supabase
        .from("office_locations")
        .select("name,lat,lon,radius_m,grace_radius_m")
        .eq("id", config.primary_office_location_id)
        .maybeSingle();

      if (cancelled) return;
      if (officeErr || !office) {
        setOfficeGeo(null);
        setOfficeGeoStatus("not_configured");
        return;
      }

      setOfficeLocationName(typeof office.name === "string" ? office.name : null);

      if (office.lat === null || office.lon === null || office.radius_m === null || office.grace_radius_m === null) {
        setOfficeGeo(null);
        setOfficeGeoStatus("not_configured");
        return;
      }

      setOfficeGeo({
        lat: office.lat,
        lon: office.lon,
        radiusM: office.radius_m,
        graceRadiusM: office.grace_radius_m,
      });
      setOfficeGeoStatus("ready");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const openCheckinAt = openSession?.checkin_at ?? null;

  useEffect(() => {
    if (!openCheckinAt) return;

    setClock(Date.now());
    const id = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [openCheckinAt]);

  const runPresenceCheck = useCallback(
    async (reason: "interval" | "manual" | "resume") => {
      if (!openSession) return;
      if (openSession.requires_presence === false) return;
      if (presenceCheckLockRef.current) return;

      presenceCheckLockRef.current = true;
      try {
        const { lat, lon } = await getCurrentPosition();

        setLastPresenceCheckAt(new Date().toISOString());

        const geo = officeGeo;
        if (geo) {
          const dist = haversineMeters(lat, lon, geo.lat, geo.lon);
          const band: typeof lastDistanceBand =
            dist <= geo.radiusM ? "in_radius" : dist <= geo.graceRadiusM ? "in_grace" : "outside_grace";
          setLastDistanceM(dist);
          setLastDistanceBand(band);
          if (band === "outside_grace") {
            setNotice("You appear to be outside the office area. Checking you out…");
          }
        } else {
          setLastDistanceM(null);
          setLastDistanceBand(null);
        }

        const res = await fetch("/api/office-hours/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat, lon, reason }),
        });

        // No longer open (manual checkout, another device, stale cron enforcement, etc.)
        if (res.status === 409) {
          await refresh();
          return;
        }

        const json = (await res.json().catch(() => null)) as { error?: string; result?: { action?: string } } | null;
        if (!res.ok) {
          setError(friendlyError(json?.error ?? ""));
          return;
        }

        const action = json?.result?.action;
        if (action === "checked_out") {
          setNotice("Checked out automatically due to presence validation.");
          await refresh();
        }
      } catch {
        setLastPresenceCheckAt(new Date().toISOString());
      } finally {
        presenceCheckLockRef.current = false;
      }
    },
    [officeGeo, openSession, refresh],
  );

  useEffect(() => {
    if (!openSession || openSession.requires_presence === false || !autoPresenceEnabled) return;

    void runPresenceCheck("resume");

    const intervalMs = 10 * 60_000;
    const id = window.setInterval(() => {
      void runPresenceCheck("interval");
    }, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void runPresenceCheck("resume");
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [autoPresenceEnabled, openSession, runPresenceCheck]);

  const onRequestCoverage = useCallback(
    async (shiftId: string) => {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const note = coverageNotesByShiftId[shiftId]?.trim() || null;
        const res = await fetch("/api/office-hours/coverage", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ shift_id: shiftId, notes: note }),
        });

        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          setError(json?.error ?? "Failed to request coverage");
          return;
        }

        setCoverageNotesByShiftId((prev) => {
          const next = { ...prev };
          delete next[shiftId];
          return next;
        });
        setNotice("Coverage request submitted.");
        await refresh();
      } finally {
        setLoading(false);
      }
    },
    [coverageNotesByShiftId, refresh],
  );

  const onClaimCoverage = useCallback(
    async (requestId: string) => {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/office-hours/coverage/${requestId}`, {
          method: "POST",
        });

        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          setError(json?.error ?? "Failed to claim coverage");
          return;
        }

        setNotice("Coverage request claimed.");
        await refresh();
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const onCancelCoverageRequest = useCallback(
    async (requestId: string) => {
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/office-hours/coverage/${requestId}`, {
          method: "DELETE",
        });

        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          setError(json?.error ?? "Failed to cancel coverage request");
          return;
        }

        setNotice("Coverage request cancelled.");
        await refresh();
      } finally {
        setLoading(false);
      }
    },
    [refresh],
  );

  const elapsedMinutes = openSession
    ? Math.max(0, Math.round((clock - new Date(openSession.checkin_at).getTime()) / 60_000))
    : null;

  const selectedWeekLabel = selectedWeekStart ? `Work week of ${selectedWeekStart}` : "Work week";

  return (
    <PageShell
      title="Office Hours"
      description="Signed-in, selfie-based Office Hours check-in with the rest of your weekly progress and session history in one place."
      containerClassName="max-w-5xl"
    >
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(249,251,255,0.96),rgba(242,246,250,0.92))] p-6 shadow-[0_36px_110px_-56px_rgba(15,23,42,0.34)]">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.10),transparent_24%)]"
          />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Member flow</p>
                <span
                  className={
                    openSession
                      ? "rounded-full bg-emerald-500/10 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700"
                      : "rounded-full bg-slate-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600"
                  }
                >
                  {openSession ? "Checked in" : "Not checked in"}
                </span>
              </div>

              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                {openSession ? "Your session is active." : "Ready for a fresh selfie check-in."}
              </h2>

              {openSession ? (
                <div className="text-sm text-slate-700">
                  Since <span className="font-medium text-slate-950">{formatInOfficeTz(openSession.checkin_at)}</span>
                  {elapsedMinutes !== null ? ` • ${formatMinutes(elapsedMinutes)}` : ""}
                </div>
              ) : (
                <div className="max-w-2xl text-sm leading-6 text-slate-600">
                  When you arrive, open the unified action screen. It starts the front camera, confirms your location,
                  and checks you in without the old public kiosk flow.
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ["Selfie required", "Every check-in uses a fresh photo."],
                  ["Signed-in flow", "No public member picker or SMS OTP."],
                  ["Fast return", "Trusted browsers cut down repeat verification."],
                ].map(([title, detail]) => (
                  <article
                    key={title}
                    className="rounded-[1.35rem] border border-white/70 bg-white/72 px-4 py-4 shadow-[0_16px_32px_-28px_rgba(15,23,42,0.36)] backdrop-blur"
                  >
                    <div className="text-sm font-semibold text-slate-900">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-600">{detail}</div>
                  </article>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-[1.6rem] border border-white/75 bg-white/80 p-4 shadow-[0_20px_44px_-32px_rgba(15,23,42,0.42)] backdrop-blur-xl sm:min-w-[16rem]">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Next action</div>
              <div className="text-sm leading-6 text-slate-600">
                {openSession
                  ? "Use the same action screen to confirm check-out."
                  : "Open the camera-first flow when you are physically at the office."}
              </div>
              <Button
                className="h-12 rounded-full px-6"
                onClick={() => router.push("/office-hours/check-in")}
                disabled={loading}
              >
                {openSession ? "Open action screen" : "Check in with selfie"}
              </Button>
              {canViewKioskSelfies ? (
                <Button
                  variant="outline"
                  className="h-11 rounded-full px-5"
                  onClick={() => window.open("/office-hours/kiosk/review", "_blank", "noopener,noreferrer")}
                  disabled={loading}
                >
                  Selfies
                </Button>
              ) : null}
              <Button variant="ghost" className="h-10 rounded-full" onClick={refresh} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>

          {notice ? (
            <div className="relative mt-4 rounded-[1.2rem] bg-white/72 px-4 py-3 text-sm text-slate-700" role="status" aria-live="polite">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="relative mt-4 rounded-[1.2rem] bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {error}
            </div>
          ) : null}

          {!openSession ? (
            <div className="relative mt-5 rounded-[1.4rem] border border-white/70 bg-white/68 px-4 py-4 text-sm text-slate-600">
              <div className="font-medium text-slate-950">How it works</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Arrive at the office and open the action screen.</li>
                <li>Take the required selfie and let location confirm you are in range.</li>
                <li>Work as usual.</li>
                <li>Return to the same screen to check out when you leave.</li>
              </ol>
            </div>
          ) : null}
        </section>

        <div className="rounded-[1.7rem] border border-foreground/10 bg-white/72 p-5 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.38)] backdrop-blur">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">{selectedWeekLabel}</div>
              {officeTz ? <div className="text-xs text-foreground/60">Times shown in {officeTz} • Mon-Fri only</div> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setWeekAnchorDate((prev) => addDays(prev, -7) ?? todayDateString())}
              >
                Prev
              </Button>
              <Button variant="outline" onClick={() => setWeekAnchorDate(todayDateString())}>
                This week
              </Button>
              <Button
                variant="outline"
                onClick={() => setWeekAnchorDate((prev) => addDays(prev, 7) ?? todayDateString())}
              >
                Next
              </Button>
              <input
                type="date"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={weekAnchorDate}
                onChange={(e) => setWeekAnchorDate(normalizeDateOnlyString(e.target.value) ?? todayDateString())}
              />
            </div>
          </div>

          {weekly ? (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="text-sm text-foreground/80">
                  Total: {formatMinutes(weekly.total_minutes)}
                </div>
                <div className="text-sm text-foreground/80">Logged: {formatMinutes(weekly.total_minutes)}</div>
                <div className="text-sm text-foreground/80">
                  Requirement total: {formatMinutes(weeklySummary?.requiredTotalMinutes ?? 0)}
                </div>
                <div className="text-sm text-foreground/80">Remaining: {formatMinutes(weekly.deficit_minutes)}</div>
              </div>
              {weeklySummary ? (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-foreground/60">
                    Total progress: {Math.round(weeklySummary.totalProgress * 100)}%
                  </div>
                  <div className="h-2 rounded-full bg-foreground/10">
                    <div
                      className="h-2 rounded-full bg-foreground/60"
                      style={{ width: `${Math.round(weeklySummary.totalProgress * 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-foreground/60">
                    Deficits represent remaining hours to meet weekly requirements. Approved exceptions count toward totals.
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="mt-2 text-sm text-foreground/70">Loading…</div>
          )}
	        </div>

        <details className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border/70">
          <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
            Details{" "}
            <span className="ml-2 text-xs font-normal text-foreground/60">
              Sessions, shifts, exceptions, and location settings
            </span>
          </summary>

          <div className="mt-5 space-y-6">
            <div className="rounded-2xl border border-foreground/10 bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium">Location & safety</div>
                {openSession ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/80">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoPresenceEnabled}
                        onChange={(e) => setAutoPresenceEnabled(e.target.checked)}
                      />
                      <span>Keep session active (recommended)</span>
                    </label>
                    <Button
                      variant="ghost"
                      onClick={() => void runPresenceCheck("manual")}
                      disabled={loading}
                      className="h-8 px-3 text-xs"
                    >
                      Verify location
                    </Button>
                  </div>
                ) : (
                  <div className="text-xs text-foreground/60">No active session.</div>
                )}
              </div>

              {openSession && lastPresenceCheckAt ? (
                <div className="mt-2 text-xs text-foreground/60">
                  Last location check: {formatInOfficeTz(lastPresenceCheckAt)}
                  {typeof lastDistanceM === "number"
                    ? ` • ~${lastDistanceM}m`
                    : officeGeo
                      ? " • —"
                      : " • (office not configured)"}
                  {lastDistanceBand === "in_radius"
                    ? " • in office"
                    : lastDistanceBand === "in_grace"
                      ? " • near office"
                      : lastDistanceBand === "outside_grace"
                        ? " • outside"
                        : ""}
                </div>
              ) : null}
              {officeConfig ? (
                <div className="mt-1 text-xs text-foreground/60">
                  Quiet hours:{" "}
                  {officeConfig.quiet_hours_enabled
                    ? `${officeConfig.quiet_hours_start_local.slice(0, 5)}–${officeConfig.quiet_hours_end_local.slice(0, 5)}`
                    : "disabled"}
                  {officeTz ? ` (${officeTz})` : ""}
                  {officeConfig.quiet_hours_enabled && quietHoursActive ? " • active now" : ""}
                </div>
              ) : null}
              {officeGeo ? (
                <div className="mt-1 text-xs text-foreground/60">
                  {officeLocationName ? `${officeLocationName} geofence` : "Office geofence"}: radius {officeGeo.radiusM}m, grace{" "}
                  {officeGeo.graceRadiusM}m
                </div>
              ) : null}
              {officeGeoStatus === "not_configured" ? (
                <div className="mt-2 text-xs text-foreground/70">
                  Office geofence isn’t configured yet. Ask an admin to set it in <span className="font-mono">/admin</span> → Office Hours Config.
                </div>
              ) : null}
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
	            <div className="rounded-lg border border-foreground/10 p-4">
	              <div className="flex flex-wrap items-end justify-between gap-3">
	                <div className="text-sm font-medium">Sessions</div>
	                <div className="text-xs text-foreground/60">Showing sessions for the selected week.</div>
	              </div>
                <div className="mt-1 text-xs text-foreground/60">
                  Legend: in office = within radius, in grace = near office, outside = beyond grace radius.
                </div>

              {sessions.length === 0 ? (
                <div className="mt-2 text-sm text-foreground/70">No sessions yet.</div>
              ) : (
                <div className="mt-3 space-y-3">
	                  {selectedWeekDays.map((day) => {
	                    const daySessions = sessionsByDay.get(day) ?? [];
	                    const totalMinutes = daySessions.reduce(
	                      (sum, s) => sum + (typeof s.duration_minutes === "number" ? s.duration_minutes : 0),
	                      0,
	                    );
	                    const inOfficeMinutes = daySessions.reduce(
	                      (sum, s) =>
	                        sum + (s.within_radius && typeof s.duration_minutes === "number" ? s.duration_minutes : 0),
	                      0,
	                    );

	                    return (
	                      <details key={day} className="rounded-md border border-foreground/10" open={daySessions.length > 0}>
	                        <summary className="cursor-pointer select-none px-3 py-2 text-sm">
	                          <span className="font-medium">{day}</span>
	                          <span className="ml-2 text-xs text-foreground/60">
	                            {daySessions.length} session{daySessions.length === 1 ? "" : "s"} • {formatMinutes(totalMinutes)}
	                            {inOfficeMinutes > 0 ? ` • in-office ${formatMinutes(inOfficeMinutes)}` : ""}
	                          </span>
	                        </summary>
	                        <div className="space-y-2 px-3 pb-3">
                          {daySessions.length === 0 ? (
                            <div className="text-sm text-foreground/70">No sessions.</div>
                          ) : (
	                            daySessions.map((s) => {
	                              return (
	                                <div key={s.id} className="rounded-md border border-foreground/10 px-3 py-2">
	                                  <div className="flex flex-wrap items-center justify-between gap-2">
	                                    <div className="text-sm text-foreground/80">
	                                      {formatInOfficeTz(s.checkin_at)}
	                                      {s.checkout_at ? ` → ${formatInOfficeTz(s.checkout_at)}` : ""}
	                                    </div>
	                                    <div className="flex items-center gap-2 text-xs text-foreground/70">
	                                      <span className="font-mono">{s.status}</span>
	                                    </div>
	                                  </div>
	                                  <div className="mt-1 text-xs text-foreground/70">
	                                    Duration: {s.duration_minutes === null ? "—" : formatMinutes(s.duration_minutes)}
	                                    {s.within_radius ? " • in office" : s.within_grace ? " • in grace" : " • outside"}
                                    {typeof s.distance_m_at_checkin === "number"
                                      ? ` • check-in ~${s.distance_m_at_checkin}m`
                                      : ""}
	                                    {typeof s.distance_m_at_checkout === "number"
	                                      ? ` • check-out ~${s.distance_m_at_checkout}m`
	                                      : ""}
	                                  </div>
	                                </div>
	                              );
	                            })
	                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-foreground/10 p-4">
              <div className="text-sm font-medium">Approved exceptions</div>
              {exceptions.length === 0 ? (
                <div className="mt-2 text-sm text-foreground/70">No exceptions.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {exceptions.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/10 px-3 py-2"
                    >
                      <div className="text-sm text-foreground/80">
                        {e.kind}: {formatMinutes(e.minutes)}
                        {e.reason ? ` • ${e.reason}` : ""}
                      </div>
                      <div className="text-xs text-foreground/70">{formatInOfficeTz(e.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2 text-xs text-foreground/60">
                Need an exception? Contact an admin to review your timesheet.
              </div>
            </div>
          </div>

              <div className="space-y-6">
            <div className="rounded-lg border border-foreground/10 p-4">
              <div className="text-sm font-medium">Shifts</div>
              <div className="mt-1 text-xs text-foreground/60">
                Request coverage for future shifts and include a note if needed.
              </div>
              {shifts.length === 0 ? (
                <div className="mt-2 text-sm text-foreground/70">No shifts scheduled.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {shifts.map((s) => {
                    const isFuture = new Date(s.starts_at) > new Date();
                    const canRequest = isFuture && s.status === "scheduled" && !s.covered_by_user_id;
                    const coverageRequest = coverageByShiftId.get(s.id) ?? null;
                    const hasPendingRequest = !!coverageRequest;
                    const noteValue = coverageNotesByShiftId[s.id] ?? "";
                    const isNow = new Date() >= new Date(s.starts_at) && new Date() <= new Date(s.ends_at);
                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/10 px-3 py-2"
                      >
                        <div className="text-sm text-foreground/80">
                          {formatInOfficeTz(s.starts_at)} → {formatInOfficeTz(s.ends_at)}
                          {isNow ? " • now" : ""}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {s.covered_by_user_id ? (
                            <span className="text-xs text-foreground/70">
                              {s.covered_by_user_id === userId ? "covered by you" : "coverage claimed"}
                            </span>
                          ) : hasPendingRequest ? (
                            <span className="text-xs text-foreground/70">
                              coverage requested{coverageRequest?.notes ? ` • ${coverageRequest.notes}` : ""}
                            </span>
                          ) : null}
                          {canRequest && !hasPendingRequest ? (
                            <>
                              <input
                                className="h-7 w-44 rounded-md border bg-transparent px-2 text-xs"
                                placeholder="Coverage note (optional)"
                                value={noteValue}
                                maxLength={120}
                                onChange={(e) =>
                                  setCoverageNotesByShiftId((prev) => ({ ...prev, [s.id]: e.target.value }))
                                }
                              />
                              <Button
                                variant="ghost"
                                onClick={() => onRequestCoverage(s.id)}
                                disabled={loading}
                                className="h-6 px-2 text-xs"
                              >
                                Request coverage
                              </Button>
                            </>
                          ) : null}
                          <span className="text-xs text-foreground/70">{s.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-foreground/10 p-4">
              <div className="text-sm font-medium">Open coverage requests</div>
              {openCoverageRequests.length === 0 ? (
                <div className="mt-2 text-sm text-foreground/70">No open coverage requests.</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {openCoverageRequests.map((cr) => {
                    const isOwn = cr.requestor_user_id === userId;
                    const shift = shiftsById.get(cr.shift_id) ?? null;
                    return (
                      <div
                        key={cr.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/10 px-3 py-2"
                      >
                        <div className="text-sm text-foreground/80">
                          {shift
                            ? `Shift: ${formatInOfficeTz(shift.starts_at)} → ${formatInOfficeTz(shift.ends_at)}`
                            : `Shift: ${cr.shift_id.slice(0, 8)}…`}
                          {cr.notes ? ` • ${cr.notes}` : ""}
                        </div>
                        <div className="flex items-center gap-2">
                          {isOwn ? (
                            <Button
                              variant="ghost"
                              onClick={() => onCancelCoverageRequest(cr.id)}
                              disabled={loading}
                              className="h-6 px-2 text-xs"
                            >
                              Cancel
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              onClick={() => onClaimCoverage(cr.id)}
                              disabled={loading}
                              className="h-6 px-2 text-xs"
                            >
                              Claim
                            </Button>
                          )}
                          <span className="text-xs text-foreground/70">{cr.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
              </div>
            </div>
          </div>
        </details>
      </div>
    </PageShell>
  );
}

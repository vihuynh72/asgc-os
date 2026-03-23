"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { KioskCameraCapture } from "@/components/office-hours/kiosk/kiosk-camera-capture";
import { Button } from "@/components/ui/button";
import {
  canSubmitMemberCheckIn,
  deriveMemberActionMode,
  deriveMemberActionStep,
  friendlyMemberActionError,
} from "@/lib/office-hours-member-action.mjs";
import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type OpenSession = {
  id: string;
  checkin_at: string;
};

type OfficeGeo = {
  lat: number;
  lon: number;
  radiusM: number;
  graceRadiusM: number;
};

type LocationSnapshot = {
  lat: number;
  lon: number;
  accuracyM: number | null;
  acquiredAt: string;
};

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

async function getCurrentPosition(): Promise<LocationSnapshot> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation_not_supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          acquiredAt: new Date().toISOString(),
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  });
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function MemberKioskScreen() {
  const reduceMotion = useReducedMotion();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [officeGeo, setOfficeGeo] = useState<OfficeGeo | null>(null);
  const [officeGeoStatus, setOfficeGeoStatus] = useState<"loading" | "ready" | "not_configured">("loading");
  const [geoPermission, setGeoPermission] = useState<"granted" | "denied" | "prompt" | "unsupported">("prompt");

  const [photo, setPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState<LocationSnapshot | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mode = deriveMemberActionMode({ openSessionId: openSession?.id ?? null });
  const preflight = useMemo(() => {
    if (!officeGeo || !location) return null;
    const distanceM = haversineMeters(location.lat, location.lon, officeGeo.lat, officeGeo.lon);
    return {
      distanceM,
      ok: distanceM <= officeGeo.graceRadiusM,
      statusLabel:
        distanceM <= officeGeo.radiusM ? "In range" : distanceM <= officeGeo.graceRadiusM ? "Grace zone" : "Out of range",
      tone:
        distanceM <= officeGeo.radiusM ? "good" : distanceM <= officeGeo.graceRadiusM ? "warning" : "critical",
      radiusM: officeGeo.radiusM,
      graceRadiusM: officeGeo.graceRadiusM,
    };
  }, [location, officeGeo]);

  const currentStep = deriveMemberActionStep({
    mode,
    hasPhoto: Boolean(photo),
    preflightReady: Boolean(preflight) && !locating,
    preflightAllowed: Boolean(preflight?.ok),
  });

  const canSubmit =
    mode === "check_out"
      ? Boolean(openSession)
      : canSubmitMemberCheckIn({
          hasPhoto: Boolean(photo),
          preflightReady: Boolean(preflight) && !locating,
          preflightAllowed: Boolean(preflight?.ok),
        });

  const refreshOpenSession = useCallback(async () => {
    const { data: sessionRow } = await supabase
      .from("office_hour_sessions")
      .select("id,checkin_at")
      .eq("status", "open")
      .is("checkout_at", null)
      .order("checkin_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setOpenSession((sessionRow as OpenSession | null) ?? null);
  }, [supabase]);

  useEffect(() => {
    void refreshOpenSession();
  }, [refreshOpenSession]);

  useEffect(() => {
    let cancelled = false;
    async function loadOfficeGeo() {
      setOfficeGeoStatus("loading");
      const { data: config, error: cfgErr } = await supabase
        .from("office_config")
        .select("primary_office_location_id")
        .eq("id", true)
        .maybeSingle();

      if (cancelled) return;
      if (cfgErr || !config?.primary_office_location_id) {
        setOfficeGeo(null);
        setOfficeGeoStatus("not_configured");
        return;
      }

      const { data: office, error: officeErr } = await supabase
        .from("office_locations")
        .select("lat,lon,radius_m,grace_radius_m,active")
        .eq("id", config.primary_office_location_id)
        .maybeSingle();

      if (cancelled) return;
      if (
        officeErr ||
        !office ||
        !office.active ||
        office.lat === null ||
        office.lon === null ||
        office.radius_m === null ||
        office.grace_radius_m === null
      ) {
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

    void loadOfficeGeo();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    if (!navigator?.permissions?.query) {
      setGeoPermission("unsupported");
      return;
    }

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setGeoPermission(status.state);
        status.onchange = () => setGeoPermission(status.state);
      })
      .catch(() => setGeoPermission("unsupported"));

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshLocation = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const snapshot = await getCurrentPosition();
      setLocation(snapshot);
    } catch {
      setLocationError("Location permission denied or unavailable.");
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "check_in" || officeGeoStatus !== "ready" || location || locating) return;
    void refreshLocation();
  }, [location, locating, mode, officeGeoStatus, refreshLocation]);

  useEffect(() => {
    if (mode === "check_out") {
      setPhoto(null);
      setLocation(null);
      setLocationError(null);
    }
  }, [mode]);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "check_out") {
        const response = await fetch("/api/office-hours/check-out", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });

        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        if (!response.ok) {
          setError(friendlyMemberActionError(json?.error ?? ""));
          return;
        }

        setNotice("Checked out.");
        await refreshOpenSession();
        return;
      }

      if (!photo || !location) {
        setError("Capture a selfie and confirm your location first.");
        return;
      }

      const formData = new FormData();
      formData.set("photo", photo);
      formData.set("lat", String(location.lat));
      formData.set("lon", String(location.lon));

      const response = await fetch("/api/office-hours/check-in", {
        method: "POST",
        body: formData,
      });

      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(friendlyMemberActionError(json?.error ?? ""));
        return;
      }

      setNotice("Checked in.");
      setPhoto(null);
      await refreshOpenSession();
    } catch {
      setError("Office Hours action failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell
      title="Office Hours kiosk"
      description="Signed-in selfie check-in and lightweight check-out in one focused Office Hours flow."
      containerClassName="max-w-6xl"
      backHref="/dashboard"
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(249,251,255,0.96),rgba(243,246,250,0.92))] p-4 shadow-[0_36px_110px_-54px_rgba(15,23,42,0.34)] sm:p-6">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.14),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.1),transparent_24%)]"
        />

        <div className="relative grid gap-5 lg:grid-cols-[1.12fr_0.88fr]">
          <motion.section
            className="rounded-[1.7rem] border border-white/75 bg-white/84 p-5 shadow-[0_24px_48px_-34px_rgba(15,23,42,0.4)] backdrop-blur-xl"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  {mode === "check_out" ? "Active session" : "Signed-in selfie kiosk"}
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                  {mode === "check_out" ? "Ready to check out?" : "Capture your check-in selfie."}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  {mode === "check_out"
                    ? "You already have an open Office Hours session, so this screen becomes a lightweight checkout confirmation."
                    : "The camera opens immediately on supported devices. Your location still has to be inside the office range before check-in completes."}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Step: {currentStep}
              </div>
            </div>

            {mode === "check_in" ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-[1.5rem] border border-slate-200/80 bg-slate-50/72 p-4">
                  <KioskCameraCapture value={photo} disabled={loading} autoStart={!photo} onChange={setPhoto} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <article className="rounded-[1.35rem] border border-slate-200/80 bg-white/78 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Location</div>
                    <div className="mt-2 text-sm text-slate-700">
                      {location
                        ? `Captured ${formatWhen(location.acquiredAt)}${location.accuracyM ? ` • ±${Math.round(location.accuracyM)}m` : ""}`
                        : "Waiting for current location."}
                    </div>
                    {preflight ? (
                      <div className="mt-3 text-sm text-slate-600">
                        {preflight.statusLabel} • {preflight.distanceM}m from office
                      </div>
                    ) : null}
                    {locationError ? <div className="mt-3 text-sm text-rose-700">{locationError}</div> : null}
                    <Button variant="outline" className="mt-4 h-11 rounded-full px-4" onClick={() => void refreshLocation()} disabled={locating || loading}>
                      {locating ? "Refreshing location..." : "Refresh location"}
                    </Button>
                  </article>

                  <article className="rounded-[1.35rem] border border-slate-200/80 bg-white/78 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Check-in rules</div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <div>Fresh selfie required every time.</div>
                      <div>Location must be inside the office radius or grace zone.</div>
                      <div>Permission state: {geoPermission}</div>
                      <div>
                        Geofence: {officeGeoStatus === "ready" ? `${officeGeo?.radiusM}m radius • ${officeGeo?.graceRadiusM}m grace` : "Not ready"}
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-[1.5rem] border border-slate-200/80 bg-slate-50/76 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Open session</div>
                <div className="mt-3 text-lg font-semibold text-slate-950">
                  {openSession ? formatWhen(openSession.checkin_at) : "No open session"}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Confirming here closes the active session and sends you back to the Office Hours home screen.
                </p>
              </div>
            )}

            {notice ? <div className="mt-4 rounded-[1.2rem] bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
            {error ? <div className="mt-4 rounded-[1.2rem] bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          </motion.section>

          <motion.aside
            className="space-y-4"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.04, ease: "easeOut" }}
          >
            <section className="rounded-[1.7rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.72))] p-5 backdrop-blur-xl">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Status</div>
              <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                {mode === "check_out" ? "Checked in" : photo ? "Selfie ready" : "Waiting for selfie"}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {mode === "check_out"
                  ? "You can finish this from here without going through another identity step."
                  : currentStep === "selfie"
                    ? "Take the selfie first. The action button unlocks after photo and location are both ready."
                    : currentStep === "location"
                      ? "The selfie is ready. Confirm you are in range to unlock check-in."
                      : "Everything needed for check-in is ready."}
              </p>

              <div className="mt-5 grid gap-3">
                <Button className="h-12 rounded-full px-6" onClick={() => void onSubmit()} disabled={loading || !canSubmit}>
                  {loading ? "Working..." : mode === "check_out" ? "Check out" : "Check in"}
                </Button>
                <Link
                  href="/dashboard"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700"
                >
                  Back to dashboard
                </Link>
              </div>
            </section>

            <section className="rounded-[1.7rem] border border-white/75 bg-white/76 p-5 backdrop-blur-xl">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Why this changed</div>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                <p>Office Hours now opens straight into this signed-in kiosk flow instead of a separate public member-picker screen.</p>
                <p>Check-in still requires a fresh selfie and geofence validation, while checkout stays intentionally lightweight.</p>
                <p>The kiosk path is now the default member destination for Office Hours across the app.</p>
              </div>
            </section>
          </motion.aside>
        </div>
      </div>
    </PageShell>
  );
}

export default function OfficeHoursKioskScreenPage() {
  return <MemberKioskScreen key={OFFICE_HOURS_MEMBER_KIOSK_PATH} />;
}

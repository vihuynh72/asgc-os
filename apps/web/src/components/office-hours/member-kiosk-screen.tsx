"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  KioskActionBar,
  KioskCameraCapture,
  KioskShell,
  KioskNotice,
  KioskStatusChip,
  KioskStepHeader,
} from "@/components/office-hours/kiosk";
import { Button } from "@/components/ui/button";
import {
  canSubmitMemberCheckIn,
  deriveMemberActionMode,
  deriveMemberActionStep,
  friendlyMemberActionError,
} from "@/lib/office-hours-member-action.mjs";
import {
  dispatchOfficeHoursSessionClosed,
  dispatchOfficeHoursSessionOpened,
} from "@/lib/office-hours-presence-lifecycle.mjs";
import {
  getMemberKioskFlowModel,
  getMemberKioskStateSummary,
  normalizeMemberCheckInSession,
} from "@/lib/office-hours-member-kiosk.mjs";
import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

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

type KioskTone = "good" | "warning" | "critical" | "neutral";
type KioskAuthStatus = "loading" | "authenticated" | "unauthenticated" | "needs_password";

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

function formatStepLabel(step: string): string {
  switch (step) {
    case "selfie":
      return "Selfie";
    case "location":
      return "Location";
    case "submit":
      return "Check in";
    case "confirm":
      return "Check out";
    default:
      return step;
  }
}

function toneForStepState(state: string, activeTone: KioskTone): KioskTone {
  if (state === "complete") return "good";
  if (state === "current") return activeTone;
  return "neutral";
}

export function MemberKioskScreen() {
  const reduceMotion = useReducedMotion();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [authStatus, setAuthStatus] = useState<KioskAuthStatus>("loading");
  const [sessionLoaded, setSessionLoaded] = useState(false);
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
  const summary = getMemberKioskStateSummary({ mode, currentStep });
  const summaryTone = summary.tone as KioskTone;
  const locationTone: KioskTone = locationError
    ? "critical"
    : ((preflight?.tone as KioskTone | undefined) ?? (location ? "neutral" : locating ? "warning" : "neutral"));
  const locationLabel = locationError
    ? "Location unavailable"
    : preflight?.statusLabel ?? (location ? "Location captured" : locating ? "Refreshing location" : "Waiting for location");
  const flowModel = useMemo(
    () =>
      getMemberKioskFlowModel({
        mode,
        hasPhoto: Boolean(photo),
        preflightReady: Boolean(preflight) && !locating,
        preflightAllowed: Boolean(preflight?.ok),
      }),
    [locating, mode, photo, preflight],
  );
  const selfieSection = flowModel.sections.find((section) => section.id === "selfie") ?? null;
  const locationSection = flowModel.sections.find((section) => section.id === "location") ?? null;
  const actionSection = flowModel.sections.find((section) => section.id === "action") ?? null;
  const activeStepNumber = mode === "check_out" ? 2 : currentStep === "selfie" ? 1 : currentStep === "location" ? 2 : 3;
  const locationSectionRef = useRef<HTMLElement | null>(null);
  const actionSectionRef = useRef<HTMLElement | null>(null);
  const previousStepRef = useRef(currentStep);

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
    let cancelled = false;

    async function checkAuth() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (!user) {
          setAuthStatus("unauthenticated");
          return;
        }

        const { data: profile } = await supabase
          .from("profile_private")
          .select("password_ready_at")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (!profile?.password_ready_at) {
          setAuthStatus("needs_password");
          return;
        }

        setAuthStatus("authenticated");
      } catch {
        if (!cancelled) {
          setAuthStatus("unauthenticated");
        }
      }
    }

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    async function run() {
      try {
        const { data: sessionRow } = await supabase
          .from("office_hour_sessions")
          .select("id,checkin_at")
          .eq("status", "open")
          .is("checkout_at", null)
          .order("checkin_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          setOpenSession((sessionRow as OpenSession | null) ?? null);
        }
      } finally {
        if (!cancelled) {
          setSessionLoaded(true);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [authStatus, supabase]);

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
    if (!sessionLoaded || mode !== "check_in" || officeGeoStatus !== "ready" || location || locating) return;
    void refreshLocation();
  }, [sessionLoaded, location, locating, mode, officeGeoStatus, refreshLocation]);

  useEffect(() => {
    if (mode === "check_out") {
      setPhoto(null);
      setLocation(null);
      setLocationError(null);
    }
  }, [mode]);

  useEffect(() => {
    const previousStep = previousStepRef.current;
    previousStepRef.current = currentStep;

    if (mode !== "check_in" || typeof window === "undefined" || window.innerWidth >= 768) {
      return;
    }

    const target =
      previousStep === "selfie" && currentStep === "location"
        ? locationSectionRef.current
        : previousStep === "location" && currentStep === "submit"
          ? actionSectionRef.current
          : null;

    if (!target) return;

    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [currentStep, mode, reduceMotion]);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "check_out") {
        const closingSessionId = openSession?.id ?? null;
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
        setOpenSession(null);
        dispatchOfficeHoursSessionClosed(closingSessionId);
        void refreshOpenSession();
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

      const json = (await response.json().catch(() => null)) as { error?: string; session?: unknown } | null;
      if (!response.ok) {
        setError(friendlyMemberActionError(json?.error ?? ""));
        return;
      }

      const nextSession = normalizeMemberCheckInSession(json?.session ?? null);
      if (!nextSession) {
        setError(friendlyMemberActionError("invalid_session"));
        return;
      }

      setOpenSession({
        id: nextSession.id,
        checkin_at: nextSession.checkin_at,
      });
      setNotice(`Checked in at ${formatWhen(nextSession.checkin_at)}.`);
      dispatchOfficeHoursSessionOpened(nextSession.id);
      setPhoto(null);
      void refreshOpenSession();
    } catch {
      setError("Office Hours action failed.");
    } finally {
      setLoading(false);
    }
  }

  const topNavElement = (
    <nav aria-label="Office Hours kiosk navigation" className="kiosk-top-nav">
      <Link href="/dashboard" className="kiosk-top-nav-brand" aria-label="Go to dashboard">
        <span className="kiosk-top-nav-mark" aria-hidden="true">
          AS
        </span>
        <span className="kiosk-top-nav-copy">
          <span className="kiosk-top-nav-title">ASGC OS</span>
          <span className="kiosk-top-nav-subtitle">Office Hours</span>
        </span>
      </Link>

      <Link href="/dashboard" className="kiosk-top-nav-action">
        Dashboard
      </Link>
    </nav>
  );

  const kioskLoginHref = `/login?redirectTo=${encodeURIComponent(OFFICE_HOURS_MEMBER_KIOSK_PATH)}`;

  if (authStatus === "loading") {
    return (
      <KioskShell className="max-w-6xl items-start py-4 sm:py-6" topNav={topNavElement}>
        <div className="kiosk-panel">
          <KioskStepHeader
            eyebrow="Office Hours"
            title="Loading..."
            step={1}
            totalSteps={1}
          />
        </div>
      </KioskShell>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <KioskShell className="max-w-6xl items-start py-4 sm:py-6" topNav={topNavElement}>
        <div className="kiosk-panel">
          <KioskStepHeader
            eyebrow="Sign-in required"
            title="Sign in to check in"
            subtitle="You need to sign in with your campus email before you can use Office Hours."
            step={1}
            totalSteps={1}
            actions={<KioskStatusChip tone="warning" label="Not signed in" />}
          />
          <div className="mt-4">
            <KioskNotice tone="warning">
              Sign in first, then come back to check in. Your selfie and location will be captured after you sign in.
            </KioskNotice>
          </div>
          <div className="mt-4 kiosk-section kiosk-step-card kiosk-step-card-active">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">1. Sign in</div>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Use your campus email</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sign in with your GCCCD email and password. First-time members will set up their password during sign-in.
              </p>
            </div>
            <div className="kiosk-step-body">
              <KioskActionBar
                primary={
                  <Link
                    href={kioskLoginHref}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-medium text-white"
                  >
                    Sign in
                  </Link>
                }
                hint="You will be redirected back here after signing in."
              />
            </div>
          </div>
        </div>
      </KioskShell>
    );
  }

  if (authStatus === "needs_password") {
    return (
      <KioskShell className="max-w-6xl items-start py-4 sm:py-6" topNav={topNavElement}>
        <div className="kiosk-panel">
          <KioskStepHeader
            eyebrow="Password required"
            title="Finish your account setup"
            subtitle="You need to create a password before you can use Office Hours."
            step={1}
            totalSteps={1}
            actions={<KioskStatusChip tone="warning" label="Setup required" />}
          />
          <div className="mt-4">
            <KioskNotice tone="warning">
              Finish your password setup before using Office Hours.
            </KioskNotice>
          </div>
          <div className="mt-4 kiosk-section kiosk-step-card kiosk-step-card-active">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">1. Create password</div>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Set up your password</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Your email is verified but you have not created a password yet. Complete the sign-in flow to set one up.
              </p>
            </div>
            <div className="kiosk-step-body">
              <KioskActionBar
                primary={
                  <Link
                    href={kioskLoginHref}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-medium text-white"
                  >
                    Complete sign-in
                  </Link>
                }
                hint="After creating your password, you will be sent back here to check in."
              />
            </div>
          </div>
        </div>
      </KioskShell>
    );
  }

  return (
    <KioskShell
      className="max-w-6xl items-start py-4 sm:py-6"
      topNav={topNavElement}
    >
      <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <motion.section
          className="kiosk-panel"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <KioskStepHeader
            eyebrow={mode === "check_out" ? "Active session" : "Signed-in selfie kiosk"}
            title={summary.title}
            subtitle={
              mode === "check_out"
                ? "You are already checked in. Close the session when you are done."
                : "Take your selfie first, then confirm the office location before you check in."
            }
            step={activeStepNumber}
            totalSteps={mode === "check_out" ? 2 : 3}
            actions={<KioskStatusChip tone={summaryTone} label={summary.chipLabel} />}
          />

          {notice ? (
            <div className="mt-4">
              <KioskNotice tone="good">{notice}</KioskNotice>
            </div>
          ) : null}
          {error ? (
            <div className="mt-4">
              <KioskNotice tone="critical">{error}</KioskNotice>
            </div>
          ) : null}

          <div className="mt-4 kiosk-page-stack">
            {mode === "check_in" ? (
              <>
                <section className={cn("kiosk-section kiosk-step-card", selfieSection?.expanded ? "kiosk-step-card-active" : undefined)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">1. Selfie</div>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Take a fresh selfie</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {photo ? "Fresh selfie captured. Retake any time before you check in." : "Capture your selfie to continue."}
                      </p>
                    </div>
                    <KioskStatusChip
                      tone={toneForStepState(selfieSection?.state ?? "locked", "neutral")}
                      label={selfieSection?.state === "complete" ? "Done" : "Required"}
                    />
                  </div>

                  {selfieSection?.expanded ? (
                    <div className="kiosk-step-body">
                      <KioskCameraCapture value={photo} disabled={loading} autoStart={sessionLoaded && !photo} onChange={setPhoto} />
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => setPhoto(null)} disabled={loading}>
                        Retake selfie
                      </Button>
                    </div>
                  )}
                </section>

                <section
                  ref={locationSectionRef}
                  className={cn("kiosk-section kiosk-step-card", locationSection?.expanded ? "kiosk-step-card-active" : undefined)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">2. Location</div>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Confirm your location</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {locationSection?.state === "locked"
                          ? "Finish the selfie first so we can confirm you are inside the office range."
                          : locationError
                            ? locationError
                            : preflight
                              ? `${locationLabel} • ${preflight.distanceM}m from office`
                              : location
                                ? "Location captured. Keep refreshing until you are in range."
                                : "Waiting for current location."}
                      </p>
                    </div>
                    <KioskStatusChip
                      tone={toneForStepState(locationSection?.state ?? "locked", locationTone)}
                      label={locationSection?.state === "locked" ? "Next" : locationLabel}
                    />
                  </div>

                  {locationSection?.expanded ? (
                    <div className="kiosk-step-body">
                      <div className="grid gap-3 md:grid-cols-2">
                        <article className="rounded-[1.2rem] border border-slate-200/80 bg-white p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Current reading</div>
                          <div className="mt-3 text-sm text-slate-700">
                            {location
                              ? `Captured ${formatWhen(location.acquiredAt)}${location.accuracyM ? ` • ±${Math.round(location.accuracyM)}m` : ""}`
                              : "Waiting for current location."}
                          </div>
                          {preflight ? <div className="mt-2 text-sm text-slate-600">{preflight.distanceM}m from office</div> : null}
                          {locationError ? <div className="mt-3 text-sm text-rose-700">{locationError}</div> : null}
                        </article>

                        <article className="rounded-[1.2rem] border border-slate-200/80 bg-white p-4">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Rules</div>
                          <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                            <div>Location must be inside the office radius or grace zone.</div>
                            <div>Permission: {geoPermission}</div>
                            <div>
                              Geofence: {officeGeoStatus === "ready" ? `${officeGeo?.radiusM}m radius • ${officeGeo?.graceRadiusM}m grace` : "Not ready"}
                            </div>
                          </div>
                        </article>
                      </div>

                      <Button
                        variant="outline"
                        className="h-11 rounded-full px-4"
                        onClick={() => void refreshLocation()}
                        disabled={locating || loading}
                      >
                        {locating ? "Refreshing location..." : "Refresh location"}
                      </Button>
                    </div>
                  ) : null}
                </section>

                <section
                  ref={actionSectionRef}
                  className={cn("kiosk-section kiosk-step-card", actionSection?.expanded ? "kiosk-step-card-active" : undefined)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">3. Check in</div>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Start your session</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {actionSection?.expanded ? "Everything is ready. Start your session when you are set." : "Selfie first, then location."}
                      </p>
                    </div>
                    <KioskStatusChip
                      tone={toneForStepState(actionSection?.state ?? "locked", summaryTone)}
                      label={actionSection?.expanded ? summary.chipLabel : "Next"}
                    />
                  </div>

                  {actionSection?.expanded ? (
                    <div className="kiosk-step-body">
                      <KioskActionBar
                        primary={
                          <Button className="h-12 rounded-full px-6" onClick={() => void onSubmit()} disabled={loading || !canSubmit}>
                            {loading ? "Working..." : "Check in"}
                          </Button>
                        }
                        secondary={
                          <Link
                            href="/dashboard"
                            className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700"
                          >
                            Back to dashboard
                          </Link>
                        }
                        hint={summary.hint}
                      />
                    </div>
                  ) : null}
                </section>
              </>
            ) : (
              <>
                <section className="kiosk-section kiosk-step-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">1. Open session</div>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">You are currently checked in</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {openSession ? `Started ${formatWhen(openSession.checkin_at)}.` : "An open Office Hours session is already active."}
                      </p>
                    </div>
                    <KioskStatusChip tone="good" label="Session open" />
                  </div>
                </section>

                <section ref={actionSectionRef} className="kiosk-section kiosk-step-card kiosk-step-card-active">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">2. Check out</div>
                      <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Close your session</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-600">When you are done, check out here to end the active session.</p>
                    </div>
                    <KioskStatusChip tone="good" label={summary.chipLabel} />
                  </div>

                  <div className="kiosk-step-body">
                    <KioskActionBar
                      primary={
                        <Button className="h-12 rounded-full px-6" onClick={() => void onSubmit()} disabled={loading || !canSubmit}>
                          {loading ? "Working..." : "Check out"}
                        </Button>
                      }
                      secondary={
                        <Link
                          href="/dashboard"
                          className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700"
                        >
                          Back to dashboard
                        </Link>
                      }
                      hint={summary.hint}
                    />
                  </div>
                </section>
              </>
            )}
          </div>
        </motion.section>

        <motion.aside
          className="hidden space-y-4 lg:block"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.04, ease: "easeOut" }}
        >
          <section className="kiosk-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Status</div>
                <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{summary.title}</div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{summary.detail}</p>
              </div>
              <KioskStatusChip tone={summaryTone} label={summary.chipLabel} />
            </div>

            <div className="mt-5 space-y-3">
              {flowModel.sections.map((section) => (
                <div key={section.id} className="rounded-[1.2rem] border border-slate-200/80 bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-slate-900">
                      {section.id === "selfie"
                        ? "Selfie"
                        : section.id === "location"
                          ? "Location"
                          : section.id === "session"
                            ? "Session"
                            : "Action"}
                    </div>
                    <KioskStatusChip
                      tone={toneForStepState(section.state, section.id === "location" ? locationTone : summaryTone)}
                      label={section.state === "complete" ? "Done" : section.state === "current" ? "Current" : "Next"}
                    />
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    {section.id === "selfie"
                      ? photo
                        ? "Fresh selfie captured."
                        : "Waiting for selfie."
                      : section.id === "location"
                        ? preflight
                          ? `${locationLabel} • ${preflight.distanceM}m from office`
                          : locationError
                            ? locationError
                            : "Waiting for office location."
                        : section.id === "session"
                          ? openSession
                            ? `Started ${formatWhen(openSession.checkin_at)}.`
                            : "Open session active."
                          : summary.hint}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="kiosk-panel">
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Quick notes</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              <p>Fresh selfie required every time.</p>
              <p>Location must be inside the office radius or grace zone.</p>
              <p>Permission: {geoPermission}</p>
              {openSession ? <p>Session started: {formatWhen(openSession.checkin_at)}</p> : null}
            </div>
          </section>
        </motion.aside>
      </div>
    </KioskShell>
  );
}

export default function OfficeHoursKioskScreenPage() {
  return <MemberKioskScreen key={OFFICE_HOURS_MEMBER_KIOSK_PATH} />;
}

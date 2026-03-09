"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import {
  KioskActionBar,
  KioskCameraCapture,
  KioskNotice,
  KioskShell,
  KioskStatusChip,
  KioskStepHeader,
} from "@/components/office-hours/kiosk";
import { Button } from "@/components/ui/button";
import {
  canSubmitKioskCheckIn,
  deriveKioskEntryStep,
} from "@/lib/office-hours-kiosk/entry-state.mjs";
import type { KioskLocationPreflightResult } from "@/lib/office-hours-kiosk/types";

type KioskOpenSession = {
  id: string;
  checkin_at: string;
};

type KioskStatus = {
  user_exists: boolean;
  open_session: KioskOpenSession | null;
};

type LocationSnapshot = {
  lat: number;
  lon: number;
  accuracyM: number | null;
  acquiredAt: string;
};

const EmailSchema = z.string().email();

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isGcccdEmail(email: string): boolean {
  return email.endsWith("@gcccd.edu");
}

function friendlyError(code: string): string {
  switch (code) {
    case "invalid_email":
      return "Enter a valid email.";
    case "email_not_allowed":
      return "Access not enabled.";
    case "email_disabled":
      return "Access disabled.";
    case "email_blocked":
      return "Access blocked.";
    case "outside_geofence":
      return "Outside office range.";
    case "already_checked_in":
      return "Session already open.";
    case "no_open_session":
      return "No open session.";
    case "office_location_not_configured":
    case "office_location_missing":
    case "office_config_missing":
      return "Location unavailable.";
    case "location_incomplete":
      return "Location incomplete.";
    case "weekend_not_allowed":
      return "Day not enabled.";
    case "photo_required":
      return "Selfie required.";
    case "invalid_photo_type":
      return "Photo type invalid.";
    case "photo_too_large":
      return "Photo too large.";
    case "invalid_lat":
    case "invalid_lon":
      return "Location invalid.";
    default:
      return code || "Something went wrong.";
  }
}

async function getCurrentPosition({
  timeoutMs = 15_000,
}: {
  timeoutMs?: number;
} = {}): Promise<LocationSnapshot> {
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
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}

function iconForTone(
  tone: KioskLocationPreflightResult["statusTone"] | "neutral",
): "triangle" | "clock" | "dot" | "check" {
  if (tone === "critical") return "triangle";
  if (tone === "warning") return "clock";
  if (tone === "good") return "check";
  return "dot";
}

function formatDistance(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)}m`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function OfficeHoursKioskPage() {
  const reduceMotion = useReducedMotion();

  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const statusAbortRef = useRef<AbortController | null>(null);

  const [location, setLocation] = useState<LocationSnapshot | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [geoPermission, setGeoPermission] = useState<
    "granted" | "denied" | "prompt" | "unsupported"
  >("prompt");

  const [preflight, setPreflight] = useState<KioskLocationPreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const preflightAbortRef = useRef<AbortController | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailNormalized = useMemo(() => normalizeEmail(email), [email]);
  const emailValid = useMemo(
    () => EmailSchema.safeParse(emailNormalized).success,
    [emailNormalized],
  );
  const emailDomainOk = useMemo(
    () => (emailValid ? isGcccdEmail(emailNormalized) : false),
    [emailNormalized, emailValid],
  );

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-kiosk", "true");
    return () => {
      html.removeAttribute("data-kiosk");
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("officeHours.kioskEmail");
      if (saved) setEmail(saved);
    } catch {
      // Ignore local storage read failures.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!navigator?.permissions?.query) {
      setGeoPermission("unsupported");
      return;
    }

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((permission) => {
        if (cancelled) return;
        setGeoPermission(permission.state);
        permission.onchange = () => setGeoPermission(permission.state);
      })
      .catch(() => setGeoPermission("unsupported"));

    return () => {
      cancelled = true;
    };
  }, []);

  const loadStatus = useCallback(async () => {
    if (!emailValid) {
      setStatus(null);
      return;
    }

    setStatusLoading(true);
    statusAbortRef.current?.abort();
    const controller = new AbortController();
    statusAbortRef.current = controller;

    try {
      const response = await fetch(
        `/api/office-hours/kiosk/status?email=${encodeURIComponent(emailNormalized)}`,
        { signal: controller.signal },
      );
      const json = (await response.json().catch(() => null)) as
        | { error?: string }
        | KioskStatus
        | null;

      if (!response.ok) {
        setStatus(null);
        setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
        return;
      }

      setStatus((json as KioskStatus) ?? null);
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return;
      setStatus(null);
      setError("Could not load status.");
    } finally {
      if (statusAbortRef.current === controller) {
        setStatusLoading(false);
      }
    }
  }, [emailNormalized, emailValid]);

  useEffect(() => {
    setError(null);
    setNotice(null);

    if (!emailValid) {
      setStatus(null);
      return;
    }

    const id = window.setTimeout(() => {
      void loadStatus();
    }, 220);
    return () => window.clearTimeout(id);
  }, [emailValid, loadStatus]);

  useEffect(() => {
    return () => {
      statusAbortRef.current?.abort();
      statusAbortRef.current = null;
      preflightAbortRef.current?.abort();
      preflightAbortRef.current = null;
    };
  }, []);

  const openSession = status?.open_session ?? null;

  useEffect(() => {
    if (!emailValid || !location || openSession) {
      setPreflight(null);
      setPreflightError(null);
      setPreflightLoading(false);
      preflightAbortRef.current?.abort();
      preflightAbortRef.current = null;
      return;
    }

    preflightAbortRef.current?.abort();
    const controller = new AbortController();
    preflightAbortRef.current = controller;
    setPreflightLoading(true);
    setPreflightError(null);

    void (async () => {
      try {
        const response = await fetch("/api/office-hours/kiosk/location-check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: emailNormalized,
            lat: location.lat,
            lon: location.lon,
            intent: "check_in",
          }),
          signal: controller.signal,
        });
        const json = (await response.json().catch(() => null)) as
          | KioskLocationPreflightResult
          | { error?: string }
          | null;

        if (!response.ok) {
          setPreflight(null);
          setPreflightError(
            friendlyError((json as { error?: string } | null)?.error ?? "Location unavailable"),
          );
          return;
        }

        setPreflight(json as KioskLocationPreflightResult);
      } catch (e) {
        if ((e as { name?: string } | null)?.name === "AbortError") return;
        setPreflight(null);
        setPreflightError("Location unavailable.");
      } finally {
        if (preflightAbortRef.current === controller) {
          setPreflightLoading(false);
        }
      }
    })();
  }, [emailNormalized, emailValid, location, openSession]);

  const stepId = useMemo(
    () =>
      deriveKioskEntryStep({
        emailValid,
        hasPhoto: Boolean(photo),
        hasOpenSession: Boolean(openSession),
        preflightReady: Boolean(preflight) && !preflightLoading,
        preflightAllowed: Boolean(preflight?.ok),
      }),
    [emailValid, openSession, photo, preflight, preflightLoading],
  );

  const stepNumber = stepId === "email" ? 1 : stepId === "selfie" ? 2 : stepId === "location" ? 3 : 4;
  const canCheckIn = canSubmitKioskCheckIn({
    emailValid,
    hasPhoto: Boolean(photo),
    preflightReady: Boolean(preflight) && !preflightLoading,
    preflightAllowed: Boolean(preflight?.ok),
  });

  const requestLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(null);
    setError(null);
    try {
      const coords = await getCurrentPosition();
      setLocation(coords);
      setNotice(null);
    } catch {
      setLocationError("Location required.");
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const onCheckIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (!emailValid) {
        setError("Enter a valid email.");
        return;
      }

      if (!photo) {
        setError("Selfie required.");
        return;
      }

      if (!location || !preflight?.ok) {
        setError("Location required.");
        return;
      }

      const form = new FormData();
      form.set("email", emailNormalized);
      form.set("lat", String(location.lat));
      form.set("lon", String(location.lon));
      form.set("photo", photo);

      const response = await fetch("/api/office-hours/kiosk/check-in", {
        method: "POST",
        body: form,
      });
      const json = (await response.json().catch(() => null)) as
        | { error?: string }
        | { session?: { checkin_at?: string } }
        | null;

      if (!response.ok) {
        setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
        return;
      }

      try {
        window.localStorage.setItem("officeHours.kioskEmail", emailNormalized);
      } catch {
        // Ignore local storage write failures.
      }

      const checkinAt = (json as { session?: { checkin_at?: string } } | null)?.session?.checkin_at;
      setNotice(checkinAt ? `Checked in ${formatWhen(checkinAt)}.` : "Checked in.");
      setPhoto(null);
      await loadStatus();
    } catch {
      setError("Check-in failed.");
    } finally {
      setLoading(false);
    }
  }, [emailNormalized, emailValid, loadStatus, location, photo, preflight?.ok]);

  const onCheckOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (!emailValid) {
        setError("Enter a valid email.");
        return;
      }

      let coords = location;
      if (!coords) {
        coords = await getCurrentPosition({ timeoutMs: 7000 }).catch(() => null);
      }

      const body: { email: string; lat?: number; lon?: number } = { email: emailNormalized };
      if (coords) {
        body.lat = coords.lat;
        body.lon = coords.lon;
        setLocation(coords);
      }

      const response = await fetch("/api/office-hours/kiosk/check-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as
        | { error?: string }
        | { session?: { duration_minutes?: number } }
        | null;

      if (!response.ok) {
        setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
        return;
      }

      try {
        window.localStorage.setItem("officeHours.kioskEmail", emailNormalized);
      } catch {
        // Ignore local storage write failures.
      }

      const minutes = (json as { session?: { duration_minutes?: number } } | null)?.session?.duration_minutes;
      setNotice(typeof minutes === "number" ? `Checked out • ${minutes}m.` : "Checked out.");
      await loadStatus();
    } catch {
      setError("Check-out failed.");
    } finally {
      setLoading(false);
    }
  }, [emailNormalized, emailValid, loadStatus, location]);

  const emailHint = useMemo(() => {
    if (!email.length) return null;
    if (!emailValid) return "Use a valid email.";
    if (!emailDomainOk) return "Use @gcccd.edu.";
    return null;
  }, [email.length, emailDomainOk, emailValid]);

  const locationSummary = useMemo(() => {
    if (!location) return "No location yet.";
    const accuracy = location.accuracyM ? `±${Math.round(location.accuracyM)}m` : null;
    return accuracy ? `Updated ${accuracy}` : "Location ready";
  }, [location]);

  const statusTone = openSession ? "good" : statusLoading ? "neutral" : "warning";
  const statusLabel = openSession
    ? "Session open"
    : statusLoading
      ? "Checking status"
      : "Ready to check in";

  return (
    <KioskShell>
      <h1 className="sr-only">Office Hours Kiosk</h1>
      <div className="kiosk-panel space-y-4">
        <KioskStepHeader
          eyebrow="Office Hours"
          title={openSession ? "Check out" : "Check in"}
          subtitle="Email. Selfie. Location."
          step={stepNumber}
          totalSteps={4}
          actions={
            <>
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white/80 px-3 text-xs font-medium text-foreground/80"
              >
                Home
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white/80 px-3 text-xs font-medium text-foreground/80"
              >
                Sign in
              </Link>
            </>
          }
        />

        <motion.section
          className="kiosk-section space-y-3"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--admin-label)]">
              Step 1 · Email
            </p>
            <KioskStatusChip tone={statusTone} icon={iconForTone(statusTone)} label={statusLabel} />
          </div>

          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            className="kiosk-input"
            placeholder="name@gcccd.edu"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="ASGC email"
          />

          <div className="flex items-center justify-between gap-2 text-xs text-foreground/65">
            <span>{emailHint ?? "Use your GCCCD email."}</span>
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-full px-3 text-xs"
              onClick={() => void loadStatus()}
              disabled={!emailValid || statusLoading || loading}
            >
              {statusLoading ? "Checking…" : "Refresh"}
            </Button>
          </div>
        </motion.section>

        {!openSession ? (
          <motion.section
            className="kiosk-section space-y-3"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut", delay: reduceMotion ? 0 : 0.04 }}
          >
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--admin-label)]">
              Step 2 · Selfie
            </p>
            <KioskCameraCapture value={photo} disabled={loading || !emailValid} onChange={setPhoto} />
          </motion.section>
        ) : null}

        <motion.section
          className="kiosk-section space-y-3"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut", delay: reduceMotion ? 0 : 0.08 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--admin-label)]">
              Step 3 · Location
            </p>
            {preflight ? (
              <KioskStatusChip
                tone={preflight.statusTone}
                icon={iconForTone(preflight.statusTone)}
                label={preflight.statusLabel}
              />
            ) : (
              <KioskStatusChip tone="neutral" icon="dot" label={locationSummary} />
            )}
          </div>

          <div className="kiosk-control-row">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-xl px-4"
              onClick={() => void requestLocation()}
              disabled={locationLoading || loading || !emailValid}
            >
              {locationLoading ? "Locating…" : location ? "Update location" : "Use location"}
            </Button>
            {location ? (
              <span className="text-xs text-foreground/65">{locationSummary}</span>
            ) : null}
          </div>

          {preflightLoading ? (
            <p className="text-xs text-foreground/65">Checking range…</p>
          ) : null}

          {preflight ? (
            <p className="text-xs text-foreground/65">
              {formatDistance(preflight.distanceM)} from office · radius{" "}
              {formatDistance(preflight.radiusM)} · grace{" "}
              {formatDistance(preflight.graceRadiusM)}
            </p>
          ) : null}

          {geoPermission === "denied" ? (
            <KioskNotice tone="critical">
              Location permission is blocked. Enable location, then retry.
            </KioskNotice>
          ) : null}

          {locationError ? <KioskNotice tone="critical">{locationError}</KioskNotice> : null}
          {preflightError ? <KioskNotice tone="critical">{preflightError}</KioskNotice> : null}
        </motion.section>

        <motion.section
          className="kiosk-section space-y-3"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut", delay: reduceMotion ? 0 : 0.12 }}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--admin-label)]">
              Step 4 · Action
            </p>
            {openSession ? (
              <KioskStatusChip tone="good" icon="check" label="Open session" />
            ) : canCheckIn ? (
              <KioskStatusChip tone="good" icon="check" label="Ready" />
            ) : (
              <KioskStatusChip tone="warning" icon="clock" label="Complete steps" />
            )}
          </div>

          {openSession ? (
            <KioskActionBar
              primary={
                <Button
                  type="button"
                  className="h-14 rounded-xl text-base"
                  onClick={() => void onCheckOut()}
                  disabled={loading || !emailValid}
                >
                  {loading ? "Checking out…" : "Check out"}
                </Button>
              }
              secondary={
                <Link
                  href="/office-hours/check-in"
                  className="inline-flex items-center justify-center border border-[var(--admin-border-soft)] bg-white/80 text-sm font-medium text-foreground/80"
                >
                  Go to check-in page
                </Link>
              }
              tertiary={
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl"
                  onClick={() => void loadStatus()}
                  disabled={statusLoading || loading || !emailValid}
                >
                  Refresh status
                </Button>
              }
              hint={`Opened ${formatWhen(openSession.checkin_at)}`}
            />
          ) : (
            <KioskActionBar
              primary={
                <Button
                  type="button"
                  className="h-14 rounded-xl text-base"
                  onClick={() => void onCheckIn()}
                  disabled={loading || !canCheckIn}
                >
                  {loading ? "Checking in…" : "Check in"}
                </Button>
              }
              secondary={
                <Link
                  href="/office-hours/check-out"
                  className="inline-flex items-center justify-center border border-[var(--admin-border-soft)] bg-white/80 text-sm font-medium text-foreground/80"
                >
                  Need check out?
                </Link>
              }
              tertiary={
                <Link
                  href="/office-hours"
                  className="inline-flex items-center justify-center border border-[var(--admin-border-soft)] bg-white/80 text-sm font-medium text-foreground/80"
                >
                  Office Hours
                </Link>
              }
              hint="Check-out remains available without location."
            />
          )}
        </motion.section>

        {!status?.user_exists && emailValid && !statusLoading ? (
          <KioskNotice tone="neutral">New account will be created on first check-in.</KioskNotice>
        ) : null}
        {notice ? <KioskNotice tone="good">{notice}</KioskNotice> : null}
        {error ? <KioskNotice tone="critical">{error}</KioskNotice> : null}
      </div>
    </KioskShell>
  );
}

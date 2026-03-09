"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import {
  KioskCameraCapture,
  KioskNotice,
  KioskShell,
  KioskStatusChip,
  KioskStepHeader,
  KioskStickyAction,
} from "@/components/office-hours/kiosk";
import { Button } from "@/components/ui/button";
import {
  deriveKioskEntryStep,
  deriveKioskStickyAction,
  normalizeKioskWizardStep,
} from "@/lib/office-hours-kiosk/entry-state.mjs";
import type { KioskLocationPreflightResult } from "@/lib/office-hours-kiosk/types";
import { cn } from "@/lib/utils";

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

type WizardStepId = "email" | "selfie" | "location" | "action";

const WIZARD_STEPS: WizardStepId[] = ["email", "selfie", "location", "action"];
const EmailSchema = z.string().email();

function stepRank(stepId: WizardStepId): number {
  return WIZARD_STEPS.indexOf(stepId) + 1;
}

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

function StepCard({
  step,
  title,
  summary,
  tone,
  icon,
  active,
  disabled,
  onActivate,
  children,
}: {
  step: number;
  title: string;
  summary: string;
  tone: "critical" | "warning" | "neutral" | "good";
  icon?: "triangle" | "clock" | "dot" | "check";
  active: boolean;
  disabled?: boolean;
  onActivate: () => void;
  children: ReactNode;
}) {
  return (
    <section className={cn("kiosk-section kiosk-step-card", active && "kiosk-step-card-active")}>
      <button
        type="button"
        className="kiosk-step-trigger"
        onClick={onActivate}
        disabled={disabled && !active}
      >
        <div className="min-w-0">
          <p className="kiosk-step-title">{step}. {title}</p>
          {!active ? <p className="kiosk-step-summary">{summary}</p> : null}
        </div>
        <KioskStatusChip tone={tone} icon={icon} label={summary} className="max-w-[58%] justify-end" />
      </button>

      {active ? <div className="kiosk-step-body">{children}</div> : null}
    </section>
  );
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

  const entryStep = useMemo(
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

  const autoWizardStep = normalizeKioskWizardStep(entryStep) as WizardStepId;
  const [focusedStep, setFocusedStep] = useState<WizardStepId>("email");

  useEffect(() => {
    setFocusedStep((previous) => {
      const previousRank = stepRank(previous);
      const autoRank = stepRank(autoWizardStep);
      if (previousRank === autoRank) return previous;
      return autoWizardStep;
    });
  }, [autoWizardStep]);

  const stickyAction = deriveKioskStickyAction({
    hasOpenSession: Boolean(openSession),
    emailValid,
    hasPhoto: Boolean(photo),
    preflightReady: Boolean(preflight) && !preflightLoading,
    preflightAllowed: Boolean(preflight?.ok),
    loading,
  });
  const stickyTone = (stickyAction.tone ?? "neutral") as
    | "critical"
    | "warning"
    | "neutral"
    | "good";

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

  const emailSummary = emailValid ? emailNormalized : "Enter GCCCD email";
  const selfieSummary = openSession
    ? "Selfie not needed"
    : photo
      ? "Selfie ready"
      : "Selfie required";
  const locationSummary = preflight
    ? preflight.statusLabel
    : location
      ? "Location ready"
      : "No location yet";

  const canOpenSelfie = emailValid && !openSession;
  const canOpenLocation = emailValid && (openSession ? true : Boolean(photo));
  const canOpenAction = emailValid;
  const stickyHint = openSession
    ? "Check-out works with or without location."
    : "Check-in requires selfie and in-range location.";

  return (
    <KioskShell>
      <h1 className="sr-only">Office Hours Kiosk</h1>

      <div className="kiosk-panel kiosk-panel-with-sticky kiosk-page-stack">
        <KioskStepHeader
          eyebrow="Office Hours"
          title={openSession ? "Check out" : "Check in"}
          subtitle="One clear step at a time."
          step={stepRank(autoWizardStep)}
          totalSteps={4}
          actions={
            <>
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-3 text-xs font-medium text-foreground/80"
              >
                Home
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-3 text-xs font-medium text-foreground/80"
              >
                Sign in
              </Link>
            </>
          }
        />

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="kiosk-page-stack"
        >
          <StepCard
            step={1}
            title="Email"
            summary={statusLoading ? "Checking…" : emailSummary}
            tone={emailValid ? "good" : "warning"}
            icon={emailValid ? "check" : "clock"}
            active={focusedStep === "email"}
            onActivate={() => setFocusedStep("email")}
          >
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
            <div className="kiosk-control-row">
              <span className="text-xs text-foreground/65">
                {email.length ? (emailDomainOk ? "Valid GCCCD email." : "Use @gcccd.edu.") : "Use your GCCCD email."}
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full px-4"
                onClick={() => void loadStatus()}
                disabled={!emailValid || statusLoading || loading}
              >
                {statusLoading ? "Checking…" : "Refresh"}
              </Button>
            </div>
          </StepCard>

          <StepCard
            step={2}
            title="Selfie"
            summary={selfieSummary}
            tone={openSession || photo ? "good" : "warning"}
            icon={openSession || photo ? "check" : "clock"}
            active={focusedStep === "selfie"}
            disabled={!canOpenSelfie}
            onActivate={() => {
              if (canOpenSelfie) setFocusedStep("selfie");
            }}
          >
            <KioskCameraCapture value={photo} disabled={loading || !emailValid || Boolean(openSession)} onChange={setPhoto} />
          </StepCard>

          <StepCard
            step={3}
            title="Location"
            summary={preflightLoading ? "Checking range…" : locationSummary}
            tone={preflight ? preflight.statusTone : location ? "neutral" : "warning"}
            icon={preflight ? iconForTone(preflight.statusTone) : "dot"}
            active={focusedStep === "location"}
            disabled={!canOpenLocation}
            onActivate={() => {
              if (canOpenLocation) setFocusedStep("location");
            }}
          >
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
                <span className="text-xs text-foreground/65">
                  {location.accuracyM ? `±${Math.round(location.accuracyM)}m` : "Updated"}
                </span>
              ) : null}
            </div>

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
          </StepCard>

          <StepCard
            step={4}
            title="Action"
            summary={stickyAction.mode === "check_out" ? "Check out" : stickyAction.label}
            tone={stickyTone}
            icon={iconForTone(stickyTone)}
            active={focusedStep === "action"}
            disabled={!canOpenAction}
            onActivate={() => {
              if (canOpenAction) setFocusedStep("action");
            }}
          >
            {openSession ? (
              <p className="text-sm text-foreground/75">
                Opened {formatWhen(openSession.checkin_at)}. Finish with check-out.
              </p>
            ) : (
              <p className="text-sm text-foreground/75">
                Complete previous steps, then use the sticky action.
              </p>
            )}
            {!status?.user_exists && emailValid && !statusLoading ? (
              <KioskNotice tone="neutral">A new account is created on first check-in.</KioskNotice>
            ) : null}
          </StepCard>
        </motion.div>

        {notice ? <KioskNotice tone="good">{notice}</KioskNotice> : null}
        {error ? <KioskNotice tone="critical">{error}</KioskNotice> : null}
      </div>

      <KioskStickyAction
        status={
          <KioskStatusChip
            tone={stickyTone}
            icon={iconForTone(stickyTone)}
            label={
              stickyAction.mode === "check_out"
                ? emailValid
                  ? "Ready to check out"
                  : "Email required"
                : stickyAction.disabled
                  ? "Complete steps"
                  : "Ready to check in"
            }
          />
        }
        primary={
          <Button
            type="button"
            className="h-14 rounded-xl text-base"
            onClick={() =>
              void (stickyAction.mode === "check_out" ? onCheckOut() : onCheckIn())
            }
            disabled={stickyAction.disabled}
          >
            {stickyAction.label}
          </Button>
        }
        secondary={
          <Link
            href={stickyAction.mode === "check_out" ? "/office-hours/check-in" : "/office-hours/check-out"}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--admin-border-soft)] bg-white px-4 text-sm font-medium text-foreground/85"
          >
            {stickyAction.mode === "check_out" ? "Open check-in page" : "Open check-out page"}
          </Link>
        }
        hint={stickyHint}
      />
    </KioskShell>
  );
}

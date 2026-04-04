"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";

import { KioskActionBar } from "./kiosk-action-bar";
import { KioskCameraCapture } from "./kiosk-camera-capture";
import { KioskNotice } from "./kiosk-notice";
import { KioskStatusChip } from "./kiosk-status-chip";
import { KioskStickyAction } from "./kiosk-sticky-action";

type KioskTone = "good" | "warning" | "critical" | "neutral";

type OpenSession = {
  id: string;
  checkin_at: string;
};

type LocationSnapshot = {
  lat: number;
  lon: number;
  accuracyM: number | null;
  acquiredAt: string;
};

type PreflightResult = {
  distanceM: number;
  ok: boolean;
  statusLabel: string;
  tone: string;
  radiusM: number;
  graceRadiusM: number;
};

type KioskSummary = {
  tone: string;
  chipLabel: string;
  title: string;
  detail: string;
  hint: string;
};

type LastSession = {
  checkin_at: string;
  checkout_at: string;
};

export type KioskMobileFlowProps = {
  mode: "check_in" | "check_out";
  currentStep: string;
  photo: File | null;
  location: LocationSnapshot | null;
  locating: boolean;
  locationError: string | null;
  preflight: PreflightResult | null;
  sessionLoaded: boolean;
  loading: boolean;
  canSubmit: boolean;
  error: string | null;
  notice: string | null;
  justCheckedOut: boolean;
  openSession: OpenSession | null;
  lastSession: LastSession | null;
  summary: KioskSummary;
  onPhotoChange: (file: File | null) => void;
  onRefreshLocation: () => void;
  onSubmit: () => void;
  onStartNewCheckin: () => void;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function SelfiePreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Selfie" className="h-12 w-12 rounded-full object-cover" />;
}

function LocationIcon() {
  return (
    <svg className="kiosk-location-simple-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function SuccessOverlay({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const id = setTimeout(onDone, 1200);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div className="kiosk-success-overlay">
      <motion.div
        className="kiosk-done-check"
        initial={reduceMotion ? false : { scale: 0 }}
        animate={reduceMotion ? undefined : { scale: [0, 1.15, 1] }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.2 8.2 6.7 11.5 12.8 4.8" />
        </svg>
      </motion.div>
      <span className="kiosk-success-overlay-text">Checked in</span>
    </div>
  );
}

export function KioskMobileFlow({
  mode,
  currentStep,
  photo,
  location,
  locating,
  locationError,
  preflight,
  sessionLoaded,
  loading,
  canSubmit,
  error,
  notice,
  justCheckedOut,
  openSession,
  lastSession,
  summary,
  onPhotoChange,
  onRefreshLocation,
  onSubmit,
  onStartNewCheckin,
}: KioskMobileFlowProps) {
  const reduceMotion = useReducedMotion();
  const [showSuccess, setShowSuccess] = useState(false);
  const [prevMode, setPrevMode] = useState(mode);

  // Detect check_in → check_out transition to trigger success overlay
  if (prevMode !== mode) {
    setPrevMode(mode);
    if (prevMode === "check_in" && mode === "check_out") {
      setShowSuccess(true);
    }
  }

  // Auto-advance from location to submit when preflight is ok
  // (No extra logic needed — currentStep changes via deriveMemberActionStep in parent)

  const viewKey = justCheckedOut ? "done" : mode === "check_out" ? "checkout" : currentStep;

  const locationStatus = locating
    ? "Checking your location..."
    : locationError
      ? "Couldn't get location"
      : preflight
        ? preflight.ok
          ? preflight.distanceM <= preflight.radiusM
            ? "You're at the office"
            : "You're nearby"
          : "Too far from office"
        : location
          ? "Location captured"
          : "Waiting for location...";

  const locationTone: KioskTone = locationError
    ? "critical"
    : preflight
      ? preflight.ok
        ? "good"
        : "critical"
      : locating
        ? "warning"
        : "neutral";

  return (
    <>
      {showSuccess && <SuccessOverlay onDone={() => setShowSuccess(false)} />}

      <div className="kiosk-flow-surface">
        {error ? (
          <div className="mb-3">
            <KioskNotice tone="critical">{error}</KioskNotice>
          </div>
        ) : null}
        {notice && !justCheckedOut ? (
          <div className="mb-3">
            <KioskNotice tone="good">{notice}</KioskNotice>
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div
            key={viewKey}
            initial={reduceMotion ? false : { opacity: 0, x: 20 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* ----- DONE VIEW ----- */}
            {justCheckedOut ? (
              <div className="kiosk-section kiosk-step-card kiosk-step-card-active">
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <motion.div
                    className="kiosk-done-check"
                    initial={reduceMotion ? false : { scale: 0 }}
                    animate={reduceMotion ? undefined : { scale: [0, 1.1, 1] }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.2 8.2 6.7 11.5 12.8 4.8" />
                    </svg>
                  </motion.div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">All done</h2>
                  {lastSession ? (
                    <>
                      <p className="text-sm text-slate-600">
                        Session lasted {formatDuration(lastSession.checkin_at, lastSession.checkout_at)}
                      </p>
                      <div className="space-y-1 text-sm text-slate-500">
                        <div>In: {formatWhen(lastSession.checkin_at)}</div>
                        <div>Out: {formatWhen(lastSession.checkout_at)}</div>
                      </div>
                    </>
                  ) : null}
                  <KioskStatusChip tone="good" label="Checked out" />
                </div>
                <div className="kiosk-step-body">
                  <KioskActionBar
                    primary={
                      <Button className="h-12 rounded-full px-6" onClick={onStartNewCheckin}>
                        Start new check-in
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
                  />
                </div>
              </div>
            ) : null}

            {/* ----- CHECKOUT VIEW ----- */}
            {!justCheckedOut && mode === "check_out" ? (
              <div className="kiosk-section kiosk-step-card kiosk-step-card-active">
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <KioskStatusChip tone="good" label="Session open" />
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">You&apos;re checked in</h2>
                  {openSession ? (
                    <p className="text-sm text-slate-600">Since {formatWhen(openSession.checkin_at)}</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ----- SELFIE VIEW ----- */}
            {!justCheckedOut && mode === "check_in" && currentStep === "selfie" ? (
              <div className="kiosk-section">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 1 of 3</span>
                  <KioskStatusChip tone="neutral" label="Selfie" />
                </div>
                <KioskCameraCapture
                  value={photo}
                  disabled={loading}
                  autoStart={sessionLoaded && !photo && !justCheckedOut}
                  compact
                  onChange={onPhotoChange}
                />
              </div>
            ) : null}

            {/* ----- LOCATION VIEW ----- */}
            {!justCheckedOut && mode === "check_in" && currentStep === "location" ? (
              <div className="kiosk-section">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 2 of 3</span>
                  <KioskStatusChip tone={locationTone} label={locationStatus} />
                </div>
                <div className="kiosk-location-simple">
                  <LocationIcon />
                  <div className="kiosk-location-simple-label">{locationStatus}</div>
                  {locating ? (
                    <div className="kiosk-location-simple-detail">This may take a moment...</div>
                  ) : null}
                  {locationError ? (
                    <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => void onRefreshLocation()}>
                      Try again
                    </Button>
                  ) : null}
                  {preflight && !preflight.ok ? (
                    <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => void onRefreshLocation()} disabled={locating}>
                      Refresh location
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ----- SUBMIT VIEW ----- */}
            {!justCheckedOut && mode === "check_in" && currentStep === "submit" ? (
              <div className="kiosk-section kiosk-step-card kiosk-step-card-active">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 3 of 3</span>
                  <KioskStatusChip tone="good" label="Ready" />
                </div>
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <div className="flex items-center gap-3">
                    {photo ? <SelfiePreview file={photo} /> : null}
                    <div className="text-left">
                      <div className="text-sm font-medium text-slate-900">Selfie captured</div>
                      <div className="text-xs text-slate-500">Location confirmed</div>
                    </div>
                  </div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">Ready to check in</h2>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky action bar */}
      {!justCheckedOut && (mode === "check_out" || currentStep === "submit") ? (
        <KioskStickyAction
          primary={
            <Button
              className="h-14 rounded-full px-8 text-base"
              onClick={() => void onSubmit()}
              disabled={loading || !canSubmit}
            >
              {loading ? "Working..." : mode === "check_out" ? "Check out" : "Check in"}
            </Button>
          }
          secondary={
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700"
            >
              Dashboard
            </Link>
          }
          hint={summary.hint}
        />
      ) : null}
    </>
  );
}

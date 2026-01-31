"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/qr-code";

type KioskOpenSession = {
  id: string;
  checkin_at: string;
};

type KioskStatus = {
  user_exists: boolean;
  open_session: KioskOpenSession | null;
};

const EmailSchema = z.string().email();

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function friendlyError(code: string): string {
  switch (code) {
    case "invalid_email":
      return "Enter a valid email.";
    case "email_not_allowed":
      return "This email isn’t allowed to use the Office Hours form. Ask an admin to add you to the allowlist.";
    case "outside_geofence":
      return "You appear to be outside the allowed office area.";
    case "already_checked_in":
      return "You already have an open session.";
    case "no_open_session":
      return "No open session found to check out.";
    case "office_location_not_configured":
      return "Office location is not fully configured yet (lat/lon/radii missing).";
    case "office_location_missing":
    case "office_config_missing":
      return "Office location is not configured yet.";
    case "location_incomplete":
      return "Location data is incomplete.";
    case "weekend_not_allowed":
      return "Office hours are only available Monday through Friday.";
    default:
      return code || "Something went wrong.";
  }
}

async function getCurrentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

export default function OfficeHoursKioskPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [geoPermission, setGeoPermission] = useState<"granted" | "denied" | "prompt" | "unsupported">("prompt");
  const [kioskLatLon, setKioskLatLon] = useState<{ lat: number; lon: number } | null>(null);
  const [qrStatus, setQrStatus] = useState<string>("");
  const [checkInUrl, setCheckInUrl] = useState<string | null>(null);
  const [checkOutUrl, setCheckOutUrl] = useState<string | null>(null);

  const emailNormalized = useMemo(() => normalizeEmail(email), [email]);
  const emailValid = useMemo(() => EmailSchema.safeParse(emailNormalized).success, [emailNormalized]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("officeHours.kioskEmail");
      if (saved) setEmail(saved);
    } catch {
      // Ignore
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

  useEffect(() => {
    let cancelled = false;
    async function ensureLocation() {
      try {
        const { lat, lon } = await getCurrentPosition();
        if (!cancelled) setKioskLatLon({ lat, lon });
      } catch {
        if (!cancelled) setKioskLatLon(null);
      }
    }
    void ensureLocation();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!kioskLatLon) {
      setCheckInUrl(null);
      setCheckOutUrl(null);
      return;
    }

    const loc = kioskLatLon;
    let cancelled = false;
    async function issue(action: "check_in" | "check_out") {
      const res = await fetch("/api/office-hours/kiosk/qr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, lat: loc.lat, lon: loc.lon }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string; url?: string } | null;
      if (cancelled) return;

      if (!res.ok || !json?.url) {
        setQrStatus(friendlyError(json?.error ?? "Failed to issue QR token"));
        if (action === "check_in") setCheckInUrl(null);
        if (action === "check_out") setCheckOutUrl(null);
        return;
      }

      setQrStatus("");
      if (action === "check_in") setCheckInUrl(json.url);
      if (action === "check_out") setCheckOutUrl(json.url);
    }

    void issue("check_in");
    void issue("check_out");

    const id = window.setInterval(() => {
      void issue("check_in");
      void issue("check_out");
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [kioskLatLon]);

  const loadStatus = useCallback(async () => {
    if (!emailValid) {
      setStatus(null);
      return;
    }

    setStatusLoading(true);
    try {
      const res = await fetch(`/api/office-hours/kiosk/status?email=${encodeURIComponent(emailNormalized)}`);
      const json = (await res.json().catch(() => null)) as { error?: string } | KioskStatus | null;

      if (!res.ok) {
        setStatus(null);
        setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
        return;
      }

      setStatus(json as KioskStatus);
    } finally {
      setStatusLoading(false);
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
    }, 300);
    return () => window.clearTimeout(id);
  }, [emailValid, loadStatus]);

  const openSession = status?.open_session ?? null;

  const onCheckIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (!emailValid) {
        setError("Enter a valid email.");
        return;
      }

      const { lat, lon } = await getCurrentPosition();

      const res = await fetch("/api/office-hours/kiosk/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailNormalized, lat, lon }),
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | { session?: { checkin_at?: string } } | null;
      if (!res.ok) {
        setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
        return;
      }

      try {
        window.localStorage.setItem("officeHours.kioskEmail", emailNormalized);
      } catch {
        // Ignore
      }

      const checkinAt = (json as { session?: { checkin_at?: string } } | null)?.session?.checkin_at;
      setNotice(checkinAt ? `Checked in at ${new Date(checkinAt).toLocaleString()}.` : "Checked in.");
      await loadStatus();
    } catch {
      setError("Location is required to check in. Enable location permissions and try again.");
    } finally {
      setLoading(false);
    }
  }, [emailNormalized, emailValid, loadStatus]);

  const onCheckOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (!emailValid) {
        setError("Enter a valid email.");
        return;
      }

      let lat: number | undefined;
      let lon: number | undefined;

      try {
        const pos = await getCurrentPosition();
        lat = pos.lat;
        lon = pos.lon;
      } catch {
        // Checkout is allowed without location, but will be flagged for review server-side.
        setNotice("Location not available. Checking out anyway (this may be flagged for review).");
      }

      const res = await fetch("/api/office-hours/kiosk/check-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailNormalized, lat, lon }),
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | { session?: { duration_minutes?: number } } | null;
      if (!res.ok) {
        setError(friendlyError((json as { error?: string } | null)?.error ?? ""));
        return;
      }

      try {
        window.localStorage.setItem("officeHours.kioskEmail", emailNormalized);
      } catch {
        // Ignore
      }

      const duration = (json as { session?: { duration_minutes?: number } } | null)?.session?.duration_minutes;
      setNotice(typeof duration === "number" ? `Checked out. Session: ${duration} minutes.` : "Checked out.");
      await loadStatus();
    } finally {
      setLoading(false);
    }
  }, [emailNormalized, emailValid, loadStatus]);

  return (
    <PageShell
      title="Office Hours Form"
      description="Kiosk QR for mobile check in/out. Email fallback is available below."
    >
      <div className="space-y-4">
        <div className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/70">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">Kiosk QR</div>
              <div className="mt-1 text-xs text-foreground/70">
                Members: scan to check in/out. Works better on mobile than background location checks.
              </div>
              {geoPermission === "denied" ? (
                <div className="mt-2 text-xs text-red-700">
                  Location permission is denied on this kiosk device. Enable location so QR issuance can be validated.
                </div>
              ) : null}
              {qrStatus ? <div className="mt-2 text-xs text-red-700">{qrStatus}</div> : null}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-muted/30 p-4">
              <div className="text-sm font-medium text-foreground">Scan to Check In</div>
              <div className="mt-3 flex items-center justify-center">
                {checkInUrl ? <QrCode value={checkInUrl} /> : <div className="h-[220px] w-[220px] rounded-2xl bg-muted/40" />}
              </div>
              <div className="mt-3 text-xs text-foreground/60">Refreshes automatically.</div>
            </div>
            <div className="rounded-2xl bg-muted/30 p-4">
              <div className="text-sm font-medium text-foreground">Scan to Check Out</div>
              <div className="mt-3 flex items-center justify-center">
                {checkOutUrl ? <QrCode value={checkOutUrl} /> : <div className="h-[220px] w-[220px] rounded-2xl bg-muted/40" />}
              </div>
              <div className="mt-3 text-xs text-foreground/60">Refreshes automatically.</div>
            </div>
          </div>
        </div>

        <details className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/70">
          <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
            Email fallback
            <span className="ml-2 text-xs font-normal text-foreground/60">
              (use if someone can’t sign in on mobile)
            </span>
          </summary>

          <div className="mt-4 rounded-lg border border-foreground/10 p-4">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">ASGC email</div>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-11 w-full rounded-md border bg-transparent px-3 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@gcccd.edu"
            />
          </label>

          <div className="mt-3 text-sm text-foreground/80">
            {!emailValid ? (
              <span>Enter your email to continue.</span>
            ) : statusLoading ? (
              <span>Checking status…</span>
            ) : openSession ? (
              <span>
                Checked in since {new Date(openSession.checkin_at).toLocaleString()}
              </span>
            ) : (
              <span>Not checked in.</span>
            )}
          </div>
          {status?.user_exists === false ? (
            <div className="mt-2 text-xs text-foreground/70">
              We could not find an existing account for this email yet. A kiosk check-in will create one.
            </div>
          ) : null}
          {geoPermission === "denied" ? (
            <div className="mt-2 text-xs text-red-600">
              Location permission is blocked. Check-in requires location access. Check-out can proceed without it.
            </div>
          ) : null}
          <div className="mt-2 text-xs text-foreground/70">Office hours are tracked Monday through Friday.</div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={onCheckIn} disabled={loading || !emailValid || !!openSession} className="h-12 text-base">
              Check In
            </Button>
            <Button
              variant="outline"
              onClick={onCheckOut}
              disabled={loading || !emailValid || !openSession}
              className="h-12 text-base"
            >
              Check Out
            </Button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={loadStatus} disabled={!emailValid || loading} className="h-8 px-2 text-xs">
              Refresh
            </Button>
          </div>

          {notice ? (
            <div className="mt-3 text-sm text-foreground/80" role="status" aria-live="polite">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </div>
          ) : null}

          <div className="mt-3 text-xs text-foreground/70">
            Check-in requires location. If you are offsite, ask an admin for guidance or coverage.
          </div>
          <div className="mt-1 text-xs text-foreground/70">
            Need access? Ask an admin to add your email to the allowlist.
          </div>
          </div>
        </details>
      </div>
    </PageShell>
  );
}

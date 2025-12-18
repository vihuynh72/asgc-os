"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

type KioskOpenSession = {
  id: string;
  checkin_at: string;
  needs_review: boolean;
  review_reason: string | null;
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
      description="Quick check in/out by email. Check-in requires your current location."
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-foreground/10 p-4">
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
                {openSession.needs_review ? " (needs review)" : ""}
              </span>
            ) : (
              <span>Not checked in.</span>
            )}
          </div>

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
            {openSession?.review_reason ? (
              <span className="text-xs text-foreground/60">Reason: {openSession.review_reason}</span>
            ) : null}
          </div>

          {notice ? <div className="mt-3 text-sm text-foreground/80">{notice}</div> : null}
          {error ? <div className="mt-3 text-sm text-red-600">{error}</div> : null}

          <div className="mt-3 text-xs text-foreground/70">
            Need access? Ask an admin to add your email to the allowlist.
          </div>
        </div>
      </div>
    </PageShell>
  );
}


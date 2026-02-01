"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type OpenSession = {
  id: string;
  checkin_at: string;
};

type OfficeGeo = {
  radiusM: number;
  graceRadiusM: number;
};

function friendlyError(message: string): string {
  switch (message) {
    case "location_required":
      return "Location is required to check in.";
    case "outside_geofence":
      return "You appear to be outside the allowed office area.";
    case "already_checked_in":
      return "You already have an open session.";
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
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  });
}

export default function OfficeHoursCheckInPage() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [geoPermission, setGeoPermission] = useState<"granted" | "denied" | "prompt" | "unsupported">("prompt");
  const [officeGeoStatus, setOfficeGeoStatus] = useState<"loading" | "ready" | "not_configured">("loading");
  const [officeGeo, setOfficeGeo] = useState<OfficeGeo | null>(null);

  const refreshOpenSession = useCallback(async () => {
    setError(null);
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

      setOfficeGeo({ radiusM: office.radius_m, graceRadiusM: office.grace_radius_m });
      setOfficeGeoStatus("ready");
    }

    void loadOfficeGeo();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const onSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { lat, lon } = await getCurrentPosition();
      const res = await fetch("/api/office-hours/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat, lon }),
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(friendlyError(json?.error ?? ""));
        return;
      }

      setNotice("Checked in.");
      await refreshOpenSession();
      router.push("/office-hours");
    } catch {
      setError("Location permission denied or unavailable.");
    } finally {
      setLoading(false);
    }
  }, [refreshOpenSession, router]);

  return (
    <PageShell title="Check In" description="Office Hours check-in requires your current location.">
      <div className="space-y-4">
        <div className="rounded-lg border border-foreground/10 p-4">
          {openSession ? (
            <div className="text-sm text-foreground/80">
              You’re already checked in (since {new Date(openSession.checkin_at).toLocaleString()}).
            </div>
          ) : (
            <div className="text-sm text-foreground/80">Not checked in.</div>
          )}
          {geoPermission === "denied" ? (
            <div className="mt-2 text-xs text-red-600">
              Location permission is blocked. Enable location access in your browser settings to check in.
            </div>
          ) : null}
          {officeGeoStatus === "not_configured" ? (
            <div className="mt-2 text-xs text-foreground/70">
              Office geofence is not configured yet. Check-in may be unavailable until an admin sets it.
            </div>
          ) : officeGeo ? (
            <div className="mt-2 text-xs text-foreground/70">
              Geofence radius {officeGeo.radiusM}m, grace {officeGeo.graceRadiusM}m. You must be on-site to check in.
            </div>
          ) : null}
          <div className="mt-2 text-xs text-foreground/70">
            Check-in is only available inside the office geofence. If you are offsite, contact an admin for an exception.
          </div>
          <div className="mt-2 text-xs text-foreground/70">
            Office hours are tracked on enabled days.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onSubmit} disabled={loading || !!openSession}>
              Check In
            </Button>
            <Link
              href="/office-hours"
              className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
            >
              Back
            </Link>
            {openSession ? (
              <Link
                href="/office-hours/check-out"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
              >
                Go to check out
              </Link>
            ) : null}
            <Link
              href="/office-hours/kiosk"
              className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
            >
              Use Office Hours Form
            </Link>
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
        </div>
      </div>
    </PageShell>
  );
}

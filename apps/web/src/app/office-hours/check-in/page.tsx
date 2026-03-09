"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  KioskActionBar,
  KioskNotice,
  KioskShell,
  KioskStatusChip,
  KioskStepHeader,
} from "@/components/office-hours/kiosk";
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
  const reduceMotion = useReducedMotion();
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
    <KioskShell>
      <div className="kiosk-panel space-y-4">
        <KioskStepHeader
          eyebrow="Office Hours"
          title="Check in"
          subtitle="On-site only."
          step={openSession ? 2 : 1}
          totalSteps={2}
          actions={
            <Link
              href="/office-hours"
              className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white/80 px-3 text-xs font-medium text-foreground/80"
            >
              Back
            </Link>
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
              Session status
            </p>
            {openSession ? (
              <KioskStatusChip tone="good" icon="check" label="Open session" />
            ) : (
              <KioskStatusChip tone="neutral" icon="dot" label="No open session" />
            )}
          </div>

          {openSession ? (
            <p className="text-sm text-foreground/75">
              Open since {new Date(openSession.checkin_at).toLocaleString()}.
            </p>
          ) : (
            <p className="text-sm text-foreground/75">Ready to start a session.</p>
          )}

          {officeGeoStatus === "not_configured" ? (
            <KioskNotice tone="warning">Geofence not configured.</KioskNotice>
          ) : null}
          {officeGeo ? (
            <p className="text-xs text-foreground/65">
              Radius {officeGeo.radiusM}m · Grace {officeGeo.graceRadiusM}m
            </p>
          ) : null}
          {geoPermission === "denied" ? (
            <KioskNotice tone="critical">
              Location permission is blocked. Enable location to check in.
            </KioskNotice>
          ) : null}
        </motion.section>

        <motion.section
          className="kiosk-section"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut", delay: reduceMotion ? 0 : 0.04 }}
        >
          <KioskActionBar
            primary={
              <Button
                className="h-14 rounded-xl text-base"
                onClick={() => void onSubmit()}
                disabled={loading || Boolean(openSession)}
              >
                {loading ? "Checking in…" : "Check in"}
              </Button>
            }
            secondary={
              openSession ? (
                <Link
                  href="/office-hours/check-out"
                  className="inline-flex items-center justify-center border border-[var(--admin-border-soft)] bg-white/80 text-sm font-medium text-foreground/80"
                >
                  Go to check out
                </Link>
              ) : (
                <Link
                  href="/office-hours/kiosk"
                  className="inline-flex items-center justify-center border border-[var(--admin-border-soft)] bg-white/80 text-sm font-medium text-foreground/80"
                >
                  Open kiosk
                </Link>
              )
            }
            tertiary={
              <Button
                variant="outline"
                className="h-12 rounded-xl"
                onClick={() => void refreshOpenSession()}
                disabled={loading}
              >
                Refresh
              </Button>
            }
            hint="Location is required for check-in."
          />
        </motion.section>

        {notice ? (
          <KioskNotice tone="good">
            <span role="status" aria-live="polite">
              {notice}
            </span>
          </KioskNotice>
        ) : null}
        {error ? (
          <KioskNotice tone="critical">
            <span role="alert">{error}</span>
          </KioskNotice>
        ) : null}
      </div>
    </KioskShell>
  );
}

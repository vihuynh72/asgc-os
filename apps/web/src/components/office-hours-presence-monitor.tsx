"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { isProbablyNetworkError, swallowNetworkError } from "@/lib/network-errors.mjs";

type OfficeGeo = {
  lat: number;
  lon: number;
  radiusM: number;
  graceRadiusM: number;
};

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
      (err) => reject(err),
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

function isAutoPresenceEnabled(): boolean {
  try {
    const v = window.localStorage.getItem("officeHours.autoPresenceEnabled");
    return v !== "0";
  } catch {
    return true;
  }
}

export function OfficeHoursPresenceMonitor() {
  const pathname = usePathname();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [officeGeo, setOfficeGeo] = useState<OfficeGeo | null>(null);

  const lockRef = useRef(false);

  // Bootstrap: when leaving /office-hours, check if there is an open session to monitor.
  useEffect(() => {
    if (pathname.startsWith("/office-hours")) return;
    if (!isAutoPresenceEnabled()) return;

    let cancelled = false;
    async function bootstrap() {
      try {
        const userResult = await swallowNetworkError(() => supabase.auth.getUser());
        if (!userResult) return;
        if (cancelled || !userResult.data?.user) return;

        const sessionResult = await swallowNetworkError(() =>
          supabase
            .from("office_hour_sessions")
            .select("id,checkin_at")
            .eq("status", "open")
            .is("checkout_at", null)
            .order("checkin_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        );

        if (!sessionResult) return;
        const { data: openSession, error: sessionErr } = sessionResult;

        if (cancelled) return;
        if (sessionErr || !openSession?.id) {
          setOpenSessionId(null);
          return;
        }

        setOpenSessionId(openSession.id);

        if (officeGeo) return;

        const configResult = await swallowNetworkError(() =>
          supabase
            .from("office_config")
            .select("primary_office_location_id")
            .eq("id", true)
            .maybeSingle()
        );

        if (!configResult) return;
        const { data: config, error: cfgErr } = configResult;

        if (cancelled || cfgErr || !config?.primary_office_location_id) return;

        const officeResult = await swallowNetworkError(() =>
          supabase
            .from("office_locations")
            .select("lat,lon,radius_m,grace_radius_m")
            .eq("id", config.primary_office_location_id)
            .maybeSingle()
        );

        if (!officeResult) return;
        const { data: office, error: officeErr } = officeResult;

        if (cancelled || officeErr || !office) return;
        if (
          office.lat === null ||
          office.lon === null ||
          office.radius_m === null ||
          office.grace_radius_m === null
        )
          return;

        setOfficeGeo({
          lat: office.lat,
          lon: office.lon,
          radiusM: office.radius_m,
          graceRadiusM: office.grace_radius_m,
        });
      } catch (error) {
        if (isProbablyNetworkError(error)) return;
        console.error("[OfficeHoursPresenceMonitor] bootstrap error:", error);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [officeGeo, pathname, supabase]);

  // Periodic presence check (when not on /office-hours).
  useEffect(() => {
    if (pathname.startsWith("/office-hours")) return;
    if (!openSessionId || !officeGeo) return;
    if (!isAutoPresenceEnabled()) return;

    const geo = officeGeo;
    let cancelled = false;

    async function tick(reason: "interval" | "resume") {
      if (cancelled) return;
      if (lockRef.current) return;

      lockRef.current = true;
      try {
        const { lat, lon } = await getCurrentPosition();
        const dist = haversineMeters(lat, lon, geo.lat, geo.lon);
        if (dist <= geo.graceRadiusM) return;

        const res = await fetch("/api/office-hours/check-out", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat, lon, reason }),
        });

        if (cancelled) return;

        // If there is no longer an open session (manual checkout, another device, etc), stop monitoring.
        if (res.status === 409) {
          setOpenSessionId(null);
          return;
        }

        if (res.ok) {
          setOpenSessionId(null);
        }
      } catch {
        // Ignore: if we can't read location, don't take action.
      } finally {
        lockRef.current = false;
      }
    }

    void tick("resume");

    const intervalMs = 30 * 60_000;
    const id = window.setInterval(() => void tick("interval"), intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick("resume");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [officeGeo, openSessionId, pathname]);

  return null;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  OFFICE_HOURS_SESSION_CLOSED_EVENT,
  OFFICE_HOURS_SESSION_OPENED_EVENT,
  reducePresenceMonitorSessionState,
} from "@/lib/office-hours-presence-lifecycle.mjs";
import { fetchLatestOwnOpenSession } from "@/lib/office-hours-open-session-client.mjs";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { isProbablyNetworkError, swallowNetworkError } from "@/lib/network-errors.mjs";

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

  const lockRef = useRef(false);

  useEffect(() => {
    function readSessionId(event: Event): string | null {
      const detail = (event as CustomEvent<{ sessionId?: string | null }>).detail;
      return typeof detail?.sessionId === "string" && detail.sessionId.length > 0 ? detail.sessionId : null;
    }

    function onSessionOpened(event: Event) {
      const sessionId = readSessionId(event);
      setOpenSessionId((current) =>
        reducePresenceMonitorSessionState({
          currentOpenSessionId: current,
          type: OFFICE_HOURS_SESSION_OPENED_EVENT,
          sessionId,
        })
      );
    }

    function onSessionClosed(event: Event) {
      const sessionId = readSessionId(event);
      setOpenSessionId((current) =>
        reducePresenceMonitorSessionState({
          currentOpenSessionId: current,
          type: OFFICE_HOURS_SESSION_CLOSED_EVENT,
          sessionId,
        })
      );
    }

    window.addEventListener(OFFICE_HOURS_SESSION_OPENED_EVENT, onSessionOpened as EventListener);
    window.addEventListener(OFFICE_HOURS_SESSION_CLOSED_EVENT, onSessionClosed as EventListener);

    return () => {
      window.removeEventListener(OFFICE_HOURS_SESSION_OPENED_EVENT, onSessionOpened as EventListener);
      window.removeEventListener(OFFICE_HOURS_SESSION_CLOSED_EVENT, onSessionClosed as EventListener);
    };
  }, []);

  // Bootstrap: check if there is an open session to monitor.
  useEffect(() => {
    if (!isAutoPresenceEnabled()) return;

    let cancelled = false;
    async function bootstrap() {
      try {
        const userResult = await swallowNetworkError(() => supabase.auth.getUser());
        if (!userResult) return;
        const userId = userResult.data?.user?.id ?? null;
        if (cancelled || !userId) return;

        const sessionResult = await swallowNetworkError(() =>
          fetchLatestOwnOpenSession(supabase, userId, "id,checkin_at,requires_presence")
        );

        if (!sessionResult) return;
        const { data: openSession, error: sessionErr } = sessionResult;

        if (cancelled) return;
        if (sessionErr || !openSession?.id || openSession.requires_presence === false) {
          setOpenSessionId(null);
          return;
        }

        setOpenSessionId(openSession.id);
      } catch (error) {
        if (isProbablyNetworkError(error)) return;
        console.error("[OfficeHoursPresenceMonitor] bootstrap error:", error);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [pathname, supabase]);

  // Presence maintenance + unload auto-checkout.
  useEffect(() => {
    if (!openSessionId) return;
    if (!isAutoPresenceEnabled()) return;

    let cancelled = false;

    async function tickGeo(reason: "interval" | "resume") {
      if (cancelled) return;
      if (lockRef.current) return;

      lockRef.current = true;
      try {
        const { lat, lon } = await getCurrentPosition();

        const res = await fetch("/api/office-hours/presence", {
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

        // Auth token expired — stop monitoring so stale presence doesn't trigger auto-close.
        // The bootstrap effect will re-check when the token is eventually refreshed.
        if (res.status === 401) {
          setOpenSessionId(null);
          return;
        }

        if (!res.ok) return;

        const json = (await res.json().catch(() => null)) as { result?: { action?: string } } | null;
        const action = json?.result?.action;
        if (action === "checked_out") {
          setOpenSessionId(null);
        }
      } catch {
        // Ignore: if we can't read location, don't take action.
      } finally {
        lockRef.current = false;
      }
    }

    async function tickPing() {
      if (cancelled) return;
      try {
        const res = await fetch("/api/office-hours/presence/ping", { method: "POST" });
        if (cancelled) return;
        if (res.status === 409) {
          setOpenSessionId(null);
          return;
        }
        if (res.status === 401) {
          setOpenSessionId(null);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as { result?: { action?: string } } | null;
        if (json?.result?.action === "checked_out") {
          setOpenSessionId(null);
        }
      } catch {
        // ignore
      }
    }

    void tickGeo("resume");
    void tickPing();

    const pingIntervalMs = 20_000;
    const pingId = window.setInterval(() => void tickPing(), pingIntervalMs);

    const geoIntervalMs = 60_000;
    const geoId = window.setInterval(() => void tickGeo("interval"), geoIntervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tickGeo("resume");
        void tickPing();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(pingId);
      window.clearInterval(geoId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [openSessionId, pathname]);

  return null;
}

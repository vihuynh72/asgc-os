"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  KioskNotice,
  KioskShell,
  KioskStatusChip,
  KioskStepHeader,
  KioskStickyAction,
} from "@/components/office-hours/kiosk";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type OpenSession = {
  id: string;
  checkin_at: string;
};

function friendlyError(message: string): string {
  switch (message) {
    case "no_open_session":
      return "No open session found to check out.";
    default:
      return message || "Something went wrong.";
  }
}

export default function OfficeHoursCheckOutPage() {
  const reduceMotion = useReducedMotion();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [openSession, setOpenSession] = useState<OpenSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const onSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/office-hours/check-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(friendlyError(json?.error ?? ""));
        return;
      }

      setNotice("Checked out.");
      await refreshOpenSession();
      router.push("/office-hours");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Check-out failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [refreshOpenSession, router]);

  return (
    <KioskShell>
      <div className="kiosk-panel kiosk-panel-with-sticky kiosk-page-stack">
        <KioskStepHeader
          eyebrow="Office Hours"
          title="Check out"
          subtitle="Close your active session."
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
              <KioskStatusChip tone="warning" icon="clock" label="No open session" />
            )}
          </div>

          {openSession ? (
            <p className="text-sm text-foreground/75">
              Started {new Date(openSession.checkin_at).toLocaleString()}.
            </p>
          ) : (
            <p className="text-sm text-foreground/75">Nothing to check out right now.</p>
          )}
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

      <KioskStickyAction
        status={
          <KioskStatusChip
            tone={openSession ? "good" : "warning"}
            icon={openSession ? "check" : "clock"}
            label={openSession ? "Ready to check out" : "No open session"}
          />
        }
        primary={
          <Button
            className="h-14 rounded-xl text-base"
            onClick={() => void onSubmit()}
            disabled={loading || !openSession}
          >
            {loading ? "Checking out…" : openSession ? "Check out" : "No open session"}
          </Button>
        }
        secondary={
          <div className="flex gap-2">
            <Link
              href={!openSession ? "/office-hours/check-in" : "/office-hours/kiosk"}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm font-medium text-foreground/85"
            >
              {!openSession ? "Open check-in page" : "Open kiosk"}
            </Link>
            <Button
              variant="outline"
              className="h-12 rounded-xl px-4"
              onClick={() => void refreshOpenSession()}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        }
        hint="Check-out can include location when available."
      />
    </KioskShell>
  );
}

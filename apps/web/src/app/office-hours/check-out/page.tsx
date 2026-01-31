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

function friendlyError(message: string): string {
  switch (message) {
    case "no_open_session":
      return "No open session found to check out.";
    default:
      return message || "Something went wrong.";
  }
}

export default function OfficeHoursCheckOutPage() {
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
    <PageShell title="Check Out" description="Check out to record your office hours.">
      <div className="space-y-4">
        <div className="rounded-lg border border-foreground/10 p-4">
          {openSession ? (
            <div className="text-sm text-foreground/80">
              Open session started {new Date(openSession.checkin_at).toLocaleString()}.
            </div>
          ) : (
            <div className="text-sm text-foreground/80">No open session.</div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onSubmit} disabled={loading || !openSession}>
              Check Out
            </Button>
            <Link
              href="/office-hours"
              className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
            >
              Back
            </Link>
            {!openSession ? (
              <Link
                href="/office-hours/check-in"
                className="inline-flex h-9 items-center justify-center rounded-md border border-foreground/20 bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
              >
                Go to check in
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

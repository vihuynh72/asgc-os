"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { ButtonLink } from "@/components/ui/button-link";

type RedeemResult =
  | { ok: true; action: "check_in" | "check_out" }
  | { error: string };

function friendlyError(code: string): string {
  switch (code) {
    case "invalid_token":
    case "token_expired":
      return "That QR code has expired. Please scan again.";
    case "token_used":
      return "That QR code was already used. Please scan again.";
    case "already_checked_in":
      return "You’re already checked in.";
    case "no_open_session":
      return "No open session found to check out.";
    case "unauthorized":
      return "Please sign in to continue.";
    default:
      return code || "Something went wrong.";
  }
}

export default function OfficeHoursScanPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error" | "auth">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing token. Please scan again.");
      return;
    }

    let cancelled = false;
    setStatus("working");
    setMessage("Verifying…");

    async function run() {
      try {
        const res = await fetch("/api/office-hours/kiosk/redeem", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const json = (await res.json().catch(() => null)) as RedeemResult | null;
        if (cancelled) return;

        if (res.status === 401) {
          setStatus("auth");
          setMessage("Please sign in to complete this scan.");
          return;
        }

        if (!res.ok) {
          const err = (json as { error?: string } | null)?.error ?? "unknown";
          setStatus("error");
          setMessage(friendlyError(err));
          return;
        }

        const action = (json as { action?: string } | null)?.action;
        setStatus("done");
        setMessage(action === "check_out" ? "Checked out." : "Checked in.");

        window.setTimeout(() => {
          router.replace("/office-hours");
        }, 900);
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage("Network error. Please try again.");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  const redirectTo = token ? `/office-hours/scan?token=${encodeURIComponent(token)}` : "/office-hours";

  return (
    <PageShell title="Office Hours" description="Kiosk scan">
      <div className="mx-auto max-w-md space-y-4 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border/70">
        <div className="text-sm text-foreground/70">{status === "working" ? "Working…" : "Status"}</div>
        <div className="text-lg font-semibold tracking-tight">{message || "—"}</div>

        {status === "auth" ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}>Sign in</ButtonLink>
            <ButtonLink href="/office-hours" variant="ghost">
              Cancel
            </ButtonLink>
          </div>
        ) : (
          <div className="text-sm text-foreground/60">
            If this doesn’t work, go back to the kiosk and scan a fresh QR code.
          </div>
        )}
      </div>
    </PageShell>
  );
}


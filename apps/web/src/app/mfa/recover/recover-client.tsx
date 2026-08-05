"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { safePostAuthRedirectPath } from "@/lib/redirects";

export function RecoverClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = useMemo(() => safePostAuthRedirectPath(searchParams.get("redirectTo")), [searchParams]);

  const [status, setStatus] = useState<"idle" | "resetting" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onReset() {
    setStatus("resetting");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/mfa-recovery/reset", { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { reason?: string } | null;
        const reason = json?.reason === "admin_recovery_requires_operator"
          ? "Admin accounts must be recovered by an Advisor/President."
          : "Could not reset 2FA. Please request a new recovery email and try again.";
        setMessage(reason);
        setStatus("error");
        return;
      }
      setStatus("done");
      router.push(`/mfa?redirectTo=${encodeURIComponent(redirectTo)}`);
    } catch {
      setStatus("error");
      setMessage("Could not reset 2FA. Please try again.");
    }
  }

  return (
    <div className="max-w-md">
      <div className="rounded-xl border bg-background p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Reset two-factor authentication</h2>
        <p className="mt-2 text-sm text-foreground/70">
          This removes your existing 2FA devices so you can set up a new authenticator.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" disabled={status === "resetting"} onClick={() => void onReset()}>
            {status === "resetting" ? "Resetting…" : "Reset 2FA"}
          </Button>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>

        {message ? <p className="mt-3 text-sm text-foreground/70">{message}</p> : null}
      </div>
    </div>
  );
}

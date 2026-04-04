"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";
import { safePostAuthRedirectPath } from "@/lib/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function OfficeHoursSetupPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [notice, setNotice] = useState<{ tone: "good" | "critical"; message: string } | null>(null);

  function getRedirectTo() {
    if (typeof window === "undefined") return OFFICE_HOURS_MEMBER_KIOSK_PATH;
    return safePostAuthRedirectPath(
      new URLSearchParams(window.location.search).get("redirectTo") ?? OFFICE_HOURS_MEMBER_KIOSK_PATH,
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setNotice(null);

    if (password.length < 8) {
      setStatus("error");
      setNotice({ tone: "critical", message: "Password must be at least 8 characters." });
      return;
    }

    if (password !== confirmPassword) {
      setStatus("error");
      setNotice({ tone: "critical", message: "Passwords do not match." });
      return;
    }

    try {
      const response = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, redirectTo: getRedirectTo() }),
      });

      const json = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
      if (!response.ok) {
        setStatus("error");
        setNotice({ tone: "critical", message: "Could not save your password. Try again." });
        return;
      }

      const next =
        typeof json?.redirectTo === "string" && json.redirectTo.startsWith("/")
          ? json.redirectTo
          : OFFICE_HOURS_MEMBER_KIOSK_PATH;

      setNotice({ tone: "good", message: "Password saved. Redirecting..." });
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.getUser();
      router.push(next);
    } catch {
      setStatus("error");
      setNotice({ tone: "critical", message: "Could not save your password. Try again." });
    } finally {
      setStatus("idle");
    }
  }

  return (
    <PageShell
      title="Set your password"
      description="Create a password for future sign-ins."
      containerClassName="max-w-lg"
      backHref={OFFICE_HOURS_MEMBER_KIOSK_PATH}
    >
      <div className="rounded-[2rem] border border-black/6 bg-white p-5 shadow-[0_28px_84px_-52px_rgba(15,23,42,0.22)] sm:p-7">
        <div className="flex items-center gap-3 pb-3">
          <span className="kiosk-top-nav-mark" aria-hidden="true">AS</span>
          <div>
            <div className="text-sm font-bold text-slate-900">ASGC OS</div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Office Hours</div>
          </div>
        </div>

        <div className="flex items-center gap-2 pb-4">
          <div className="kiosk-step-dots">
            <span className="kiosk-step-dot kiosk-step-dot-active" />
            <span className="kiosk-step-dot kiosk-step-dot-active" />
            <span className="kiosk-step-dot kiosk-step-dot-active" />
          </div>
          <span className="text-xs text-slate-400">Step 3 of 3</span>
        </div>

        <div className="space-y-1 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">One-time setup</p>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Create a password</h2>
          <p className="text-sm leading-6 text-slate-600">
            Set a password so future sign-ins stay fast.
          </p>
        </div>

        {notice ? <AdminInlineNotice tone={notice.tone}>{notice.message}</AdminInlineNotice> : null}

        <form className="mt-4 space-y-4" onSubmit={onSubmit}>
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-12 w-full rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 text-[15px] text-slate-950 outline-none transition focus:border-slate-400"
              placeholder="At least 8 characters"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Confirm password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-12 w-full rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 text-[15px] text-slate-950 outline-none transition focus:border-slate-400"
              placeholder="Repeat your password"
            />
          </label>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              className="h-12 rounded-full px-6"
              disabled={status === "saving" || password.length === 0 || confirmPassword.length === 0}
            >
              {status === "saving" ? "Saving..." : "Save password"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-full px-6"
              onClick={() => router.push(OFFICE_HOURS_MEMBER_KIOSK_PATH)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}

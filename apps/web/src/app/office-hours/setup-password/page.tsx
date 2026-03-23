"use client";

import { useState } from "react";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";
import { safePostAuthRedirectPath } from "@/lib/redirects";

export default function OfficeHoursSetupPasswordPage() {
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

      setNotice({ tone: "good", message: "Password saved. Redirecting to Office Hours..." });
      window.location.assign(
        typeof json?.redirectTo === "string" && json.redirectTo.startsWith("/")
          ? json.redirectTo
          : OFFICE_HOURS_MEMBER_KIOSK_PATH,
      );
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
      description="Office Hours needs a reusable password so future sign-ins stay fast on trusted devices."
      containerClassName="max-w-3xl"
      backHref={OFFICE_HOURS_MEMBER_KIOSK_PATH}
    >
      <div className="relative overflow-hidden rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(250,252,255,0.96),rgba(243,246,250,0.92))] p-5 shadow-[0_36px_100px_-52px_rgba(15,23,42,0.35)] sm:p-7">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.10),transparent_25%)]"
        />

        <div className="relative grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="rounded-[1.6rem] border border-white/70 bg-white/72 p-5 backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Office Hours</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">One-time setup.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              You only need to do this once for the new member flow. After that, trusted browsers can skip repeat email
              verification for 30 days.
            </p>

            <div className="mt-6 space-y-3 rounded-[1.4rem] border border-dashed border-slate-300/80 bg-white/55 p-4 text-sm text-slate-600">
              <div>1. Create a password you can reuse.</div>
              <div>2. Return to Office Hours and take your selfie.</div>
              <div>3. Future member sign-ins stay inside the signed-in app flow.</div>
            </div>
          </section>

          <section className="rounded-[1.6rem] border border-white/75 bg-white/84 p-5 shadow-[0_22px_48px_-34px_rgba(15,23,42,0.4)] backdrop-blur-xl">
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
                  onClick={() => window.location.assign(OFFICE_HOURS_MEMBER_KIOSK_PATH)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

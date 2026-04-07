"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import {
  buildPasswordSetupRecoveryHref,
  getPasswordSetupFailureMessage,
  getPasswordSetupWarningMessage,
  normalizePasswordSetupMode,
} from "@/lib/auth/password-setup.mjs";
import { safePostAuthRedirectPath } from "@/lib/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

function getSetupCopy(mode: "first_time" | "reset", isKioskFlow: boolean) {
  if (mode === "reset") {
    return {
      eyebrow: "Reset password",
      title: "Choose a new password",
      detail: "This verified link lets you update the password used for future sign-ins.",
      success: "Password updated. Redirecting...",
    };
  }

  if (isKioskFlow) {
    return {
      eyebrow: "One-time setup",
      title: "Create a password",
      detail: "Finish setup so future sign-ins stay fast for Office Hours.",
      success: "Password saved. Redirecting...",
    };
  }

  return {
    eyebrow: "Create password",
    title: "Create your password",
    detail: "You are verified. Set your password now so future sign-ins stay fast on this device.",
    success: "Password created. Redirecting...",
  };
}

export default function PasswordSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = useMemo(
    () => normalizePasswordSetupMode(searchParams.get("mode")) as "first_time" | "reset",
    [searchParams],
  );
  const redirectTo = useMemo(() => safePostAuthRedirectPath(searchParams.get("redirectTo")), [searchParams]);
  const isKioskFlow = redirectTo.startsWith("/office-hours");
  const copy = useMemo(() => getSetupCopy(mode, isKioskFlow), [isKioskFlow, mode]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [notice, setNotice] = useState<{ tone: "good" | "warning" | "critical"; message: string } | null>(null);

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
        body: JSON.stringify({
          password,
          redirectTo,
          trustDevice: mode === "first_time" ? trustDevice : undefined,
        }),
      });

      const json = (await response.json().catch(() => null)) as {
        redirectTo?: string;
        reason?: string;
        warningReason?: string;
      } | null;
      if (!response.ok) {
        const recoveryHref = buildPasswordSetupRecoveryHref({ mode, redirectTo, reason: json?.reason });
        if (recoveryHref) {
          window.location.assign(recoveryHref);
          return;
        }
        setStatus("error");
        setNotice({ tone: "critical", message: getPasswordSetupFailureMessage(json?.reason) });
        return;
      }

      const next =
        typeof json?.redirectTo === "string" && json.redirectTo.startsWith("/")
          ? json.redirectTo
          : redirectTo;
      const warningMessage = getPasswordSetupWarningMessage(json?.warningReason);

      setNotice({
        tone: warningMessage ? "warning" : "good",
        message: warningMessage ? `${warningMessage} Redirecting...` : copy.success,
      });
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.getUser();

      if (isKioskFlow && next.startsWith("/office-hours")) {
        router.push(next);
      } else {
        window.location.assign(next);
      }
    } catch {
      setStatus("error");
      setNotice({ tone: "critical", message: getPasswordSetupFailureMessage("password_update_failed") });
    } finally {
      setStatus("idle");
    }
  }

  return (
    <PageShell
      title={copy.title}
      description={copy.detail}
      containerClassName="max-w-lg"
    >
      <div className="rounded-[2rem] border border-black/6 bg-white p-5 shadow-[0_28px_84px_-52px_rgba(15,23,42,0.22)] sm:p-7">
        {isKioskFlow ? (
          <>
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
          </>
        ) : null}

        <div className="space-y-1 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{copy.eyebrow}</p>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{copy.title}</h2>
          <p className="text-sm leading-6 text-slate-600">{copy.detail}</p>
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

          {mode === "first_time" ? (
            <label className="flex items-center gap-3 rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={trustDevice}
                onChange={(event) => setTrustDevice(event.target.checked)}
              />
              <span>Trust this browser for 30 days so future password sign-ins stay one-step here.</span>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              type="submit"
              className="h-12 rounded-full px-6"
              disabled={status === "saving" || password.length === 0 || confirmPassword.length === 0}
            >
              {status === "saving"
                ? "Saving..."
                : mode === "reset"
                  ? "Save new password"
                  : "Create password"}
            </Button>
          </div>
        </form>

        <form action="/auth/signout" method="post" className="mt-3">
          <Button type="submit" variant="outline" className="h-12 rounded-full px-6">
            Sign out
          </Button>
        </form>
      </div>
    </PageShell>
  );
}

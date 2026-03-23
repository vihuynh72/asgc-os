"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { safePostAuthRedirectPath } from "@/lib/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type AuthPanelMode = "password" | "password_otp" | "first_time" | "first_time_verify";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function AuthCallbackErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const message =
    error === "auth_callback_failed"
      ? "That sign-in link could not be verified. Request a fresh email and try again."
      : error === "not_allowlisted"
        ? "Your email is not invited right now. Contact an admin if you need access."
        : error === "server_error"
          ? "Sign-in failed due to a server error. Try again or contact an admin."
          : null;

  if (!message) return null;
  return <AdminInlineNotice tone="critical">{message}</AdminInlineNotice>;
}

function SupabaseHashErrorBanner() {
  const hash = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("hashchange", onStoreChange);
      return () => window.removeEventListener("hashchange", onStoreChange);
    },
    () => window.location.hash,
    () => "",
  );

  const message = useMemo(() => {
    if (!hash || hash === "#") return null;

    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const error = params.get("error");
    const errorCode = params.get("error_code");

    if (error === "access_denied" && errorCode === "otp_expired") {
      return "That email link is invalid or already used. Request a fresh email or use the code entry instead.";
    }

    if (error === "access_denied") {
      return params.get("error_description") ?? "Access denied. Request a new sign-in email.";
    }

    return null;
  }, [hash]);

  if (!message) return null;
  return <AdminInlineNotice tone="critical">{message}</AdminInlineNotice>;
}

function loginPanelCopy(mode: AuthPanelMode) {
  switch (mode) {
    case "password_otp":
      return {
        eyebrow: "Email check",
        title: "Verify this browser",
        detail: "Enter the code we sent after your password was accepted.",
      };
    case "first_time":
      return {
        eyebrow: "First sign-in",
        title: "Start with your campus email",
        detail: "We’ll email a six-digit code so you can create your account cleanly.",
      };
    case "first_time_verify":
      return {
        eyebrow: "Email code",
        title: "Finish your first sign-in",
        detail: "Enter the six-digit code from your email to finish signing in on this device.",
      };
    default:
      return {
        eyebrow: "Member sign-in",
        title: "Sign in with your password",
        detail: "Returning members use password first. New browsers get a quick email check.",
      };
  }
}

export default function LoginPage() {
  const [existingUser, setExistingUser] = useState<{ email: string | null } | null>(null);
  const [postAuthRedirectTo, setPostAuthRedirectTo] = useState<string>("/dashboard");

  const [panelMode, setPanelMode] = useState<AuthPanelMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  const [busyAction, setBusyAction] = useState<"idle" | "password" | "verify" | "first_time" | "reset">("idle");
  const [notice, setNotice] = useState<{ tone: "good" | "critical"; message: string } | null>(null);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const copy = useMemo(() => loginPanelCopy(panelMode), [panelMode]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuthState() {
      try {
        const redirectTo = safePostAuthRedirectPath(new URLSearchParams(window.location.search).get("redirectTo"));
        if (!cancelled) setPostAuthRedirectTo(redirectTo);
      } catch {
        // Ignore; fallback stays in place.
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!cancelled && user) {
          setExistingUser({ email: user.email ?? null });
        }
      } catch {
        // Ignore.
      }
    }

    void hydrateAuthState();
    return () => {
      cancelled = true;
    };
  }, []);

  function getRedirectToForRequests(): string | undefined {
    try {
      return safePostAuthRedirectPath(new URLSearchParams(window.location.search).get("redirectTo"));
    } catch {
      return undefined;
    }
  }

  async function onPasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("password");
    setNotice(null);

    try {
      const redirectTo = getRedirectToForRequests();
      const response = await fetch("/api/auth/signin-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password, redirectTo }),
      });

      const json = (await response.json().catch(() => null)) as
        | { redirectTo?: string; nextStep?: "email_otp" }
        | null;

      if (!response.ok) {
        setNotice({ tone: "critical", message: "Sign-in failed. Check your email or password." });
        return;
      }

      if (json?.nextStep === "email_otp") {
        setCode("");
        setPanelMode("password_otp");
        setNotice({ tone: "good", message: "Password accepted. Enter the code we emailed to finish sign-in." });
        return;
      }

      const next = typeof json?.redirectTo === "string" && json.redirectTo.startsWith("/") ? json.redirectTo : "/dashboard";
      window.location.assign(next);
    } catch {
      setNotice({ tone: "critical", message: "Sign-in failed. Try again." });
    } finally {
      setBusyAction("idle");
    }
  }

  async function onFirstTimeSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("first_time");
    setNotice(null);

    try {
      const redirectTo = getRedirectToForRequests();
      const response = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, redirectTo }),
      });

      if (!response.ok) {
        setNotice({ tone: "critical", message: "Could not send the sign-in email. Try again." });
        return;
      }

      setCode("");
      setPanelMode("first_time_verify");
      setNotice({ tone: "good", message: "Check your email for the six-digit code, then enter it below." });
    } catch {
      setNotice({ tone: "critical", message: "Could not send the sign-in email. Try again." });
    } finally {
      setBusyAction("idle");
    }
  }

  async function onVerifySubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusyAction("verify");
    setNotice(null);

    try {
      const redirectTo = getRedirectToForRequests();
      const endpoint = panelMode === "password_otp" ? "/api/auth/complete-password-signin" : "/api/auth/verify-otp";
      const payload =
        panelMode === "password_otp"
          ? { email: normalizedEmail, code, trustDevice, redirectTo }
          : { email: normalizedEmail, token: code, redirectTo };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
      if (!response.ok) {
        setNotice({
          tone: "critical",
          message:
            panelMode === "password_otp"
              ? "That browser verification code did not match. Request a fresh sign-in if needed."
              : "That code could not be verified. Request a new sign-in code.",
        });
        return;
      }

      const next = typeof json?.redirectTo === "string" && json.redirectTo.startsWith("/") ? json.redirectTo : "/dashboard";
      window.location.assign(next);
    } catch {
      setNotice({ tone: "critical", message: "Verification failed. Try again." });
    } finally {
      setBusyAction("idle");
    }
  }

  async function onRequestPasswordReset() {
    setBusyAction("reset");
    setNotice(null);

    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, redirectTo: "/account" }),
      });

      if (!response.ok) {
        setNotice({ tone: "critical", message: "Could not send a reset email. Try again." });
        return;
      }

      setNotice({ tone: "good", message: "If invited, a password reset email is on the way." });
    } catch {
      setNotice({ tone: "critical", message: "Could not send a reset email. Try again." });
    } finally {
      setBusyAction("idle");
    }
  }

  return (
    <PageShell title="Sign in" showHeader={false} containerClassName="max-w-6xl px-4 py-10 sm:py-14">
      <section className="relative overflow-hidden rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(250,252,255,0.96),rgba(242,245,250,0.92))] shadow-[0_40px_120px_-56px_rgba(15,23,42,0.38)]">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(79,120,214,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.8),rgba(255,255,255,0.5))]"
        />

        <div className="relative grid gap-6 p-4 sm:p-6 lg:grid-cols-[1.08fr_0.92fr] lg:p-8">
          <section className="flex flex-col justify-between rounded-[1.8rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(248,250,252,0.62))] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl sm:p-8">
            <div className="space-y-6">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
                <span>ASGC OS</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>Member Access</span>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{copy.eyebrow}</p>
                <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  One sign-in surface for the whole ASGC app.
                </h1>
                <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                  Password is the default. First-time members start with email verification, and returning members only
                  see the extra code step on browsers the system does not trust yet.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Password first", "Primary flow for returning members"],
                  ["Quick email check", "Only on untrusted browsers"],
                  ["Office Hours ready", "Same identity flows into selfie check-in"],
                ].map(([title, detail]) => (
                  <article
                    key={title}
                    className="rounded-[1.5rem] border border-white/70 bg-white/74 px-4 py-4 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.42)] backdrop-blur"
                  >
                    <div className="text-sm font-semibold text-slate-900">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-600">{detail}</div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-[1.5rem] border border-dashed border-slate-300/80 bg-white/55 px-4 py-4 text-sm text-slate-600">
              Campus email only. After your first successful sign-in, Office Hours takes you straight into the signed-in
              app flow instead of the old public kiosk flow.
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/75 bg-white/82 p-5 shadow-[0_24px_48px_-32px_rgba(15,23,42,0.44)] backdrop-blur-xl sm:p-6">
            <div className="space-y-4">
              {existingUser ? (
                <div className="rounded-[1.35rem] border border-emerald-200/70 bg-emerald-50/75 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Already signed in</div>
                  <div className="mt-2 text-sm text-emerald-950">{existingUser.email ?? "Current account"}</div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button className="h-11 rounded-full px-5" onClick={() => window.location.assign(postAuthRedirectTo)}>
                      Continue
                    </Button>
                    <form action="/auth/signout" method="post">
                      <Button type="submit" variant="outline" className="h-11 rounded-full px-5">
                        Sign out
                      </Button>
                    </form>
                  </div>
                </div>
              ) : null}

              <Suspense fallback={null}>
                <AuthCallbackErrorBanner />
              </Suspense>
              <SupabaseHashErrorBanner />
              {notice ? <AdminInlineNotice tone={notice.tone}>{notice.message}</AdminInlineNotice> : null}

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{copy.eyebrow}</p>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{copy.title}</h2>
                <p className="text-sm leading-6 text-slate-600">{copy.detail}</p>
              </div>

              {(panelMode === "password" || panelMode === "first_time") ? (
                <form className="space-y-4" onSubmit={panelMode === "password" ? onPasswordSubmit : onFirstTimeSubmit}>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Campus email</span>
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="name@gcccd.edu"
                      className="h-12 w-full rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 text-[15px] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-slate-400"
                    />
                  </label>

                  {panelMode === "password" ? (
                    <label className="block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password</span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Password"
                        className="h-12 w-full rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 text-[15px] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-slate-400"
                      />
                    </label>
                  ) : null}

                  <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
                    <Button
                      type="submit"
                      className="h-12 rounded-full px-6"
                      disabled={
                        busyAction !== "idle" ||
                        normalizedEmail.length === 0 ||
                        (panelMode === "password" && password.length === 0)
                      }
                    >
                      {busyAction === "password"
                        ? "Signing in..."
                        : busyAction === "first_time"
                          ? "Sending..."
                          : panelMode === "password"
                            ? "Sign in"
                            : "Send sign-in code"}
                    </Button>

                    {panelMode === "password" ? (
                      <>
                        <button
                          type="button"
                          className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
                          onClick={() => {
                            setPanelMode("first_time");
                            setNotice(null);
                            setCode("");
                          }}
                        >
                          First time signing in?
                        </button>
                        <button
                          type="button"
                          className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
                          disabled={busyAction === "reset" || normalizedEmail.length === 0}
                          onClick={() => void onRequestPasswordReset()}
                        >
                          {busyAction === "reset" ? "Sending reset..." : "Reset password"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
                        onClick={() => {
                          setPanelMode("password");
                          setNotice(null);
                          setCode("");
                        }}
                      >
                        Back to password sign-in
                      </button>
                    )}
                  </div>
                </form>
              ) : null}

              {(panelMode === "password_otp" || panelMode === "first_time_verify") ? (
                <form className="space-y-4" onSubmit={onVerifySubmit}>
                  <div className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/75 px-4 py-3 text-sm text-slate-600">
                    {panelMode === "password_otp"
                      ? "This browser is not trusted yet. Enter the email code to finish signing in."
                      : "Enter the six-digit code from your email. There is no sign-in link in this flow."}
                  </div>

                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Code</span>
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="6-digit code"
                      className="h-12 w-full rounded-[1.2rem] border border-slate-200 bg-white/90 px-4 text-[15px] text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] outline-none transition focus:border-slate-400"
                    />
                  </label>

                  {panelMode === "password_otp" ? (
                    <label className="flex items-center gap-3 rounded-[1.2rem] border border-slate-200/80 bg-white/75 px-4 py-3 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={trustDevice}
                        onChange={(event) => setTrustDevice(event.target.checked)}
                      />
                      Trust this browser for 30 days
                    </label>
                  ) : null}

                  <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
                    <Button
                      type="submit"
                      className="h-12 rounded-full px-6"
                      disabled={busyAction !== "idle" || normalizedEmail.length === 0 || code.trim().length === 0}
                    >
                      {busyAction === "verify" ? "Verifying..." : "Verify code"}
                    </Button>
                    <button
                      type="button"
                      className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
                      onClick={() => {
                        setCode("");
                        setNotice(null);
                        setPanelMode(panelMode === "password_otp" ? "password" : "first_time");
                      }}
                    >
                      Start over
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="rounded-[1.25rem] border border-dashed border-slate-300/85 bg-white/52 px-4 py-4 text-sm leading-6 text-slate-600">
                <p>Use your GCCCD email. First-time sign-in emails now contain only the code, so Safe Links rewriting does not break the flow.</p>
                <p className="mt-2">After the first successful sign-in, Office Hours can send you into the password-setup step automatically when needed.</p>
              </div>
            </div>
          </section>
        </div>
      </section>
    </PageShell>
  );
}

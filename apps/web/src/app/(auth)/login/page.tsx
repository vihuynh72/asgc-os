"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import {
  getLoginModeContent,
  getLoginPrimaryActionLabel,
  getLoginStatusNotice,
  getLoginVerifyNotice,
} from "@/lib/login-view.mjs";
import { safePostAuthRedirectPath } from "@/lib/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const REMEMBERED_EMAILS_KEY = "asgc:remembered_emails:v1";

function readRememberedEmails(): string[] {
  try {
    const raw = window.localStorage.getItem(REMEMBERED_EMAILS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === "string" ? normalizeEmail(v) : ""))
      .filter(Boolean)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function writeRememberedEmails(emails: string[]) {
  try {
    window.localStorage.setItem(REMEMBERED_EMAILS_KEY, JSON.stringify(emails.slice(0, 5)));
  } catch {
    // Ignore.
  }
}

function rememberEmailOnDevice(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  const prev = readRememberedEmails();
  const next = [normalized, ...prev.filter((e) => e !== normalized)].slice(0, 5);
  writeRememberedEmails(next);
}

function forgetRememberedEmails() {
  try {
    window.localStorage.removeItem(REMEMBERED_EMAILS_KEY);
  } catch {
    // Ignore.
  }
}

function AuthCallbackErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const message =
    error === "auth_callback_failed"
      ? "That sign-in link could not be verified. Please request a new link and try again."
      : error === "not_allowlisted"
        ? "Your email is not invited (or access was revoked). Please contact an admin."
        : error === "server_error"
          ? "Sign-in failed due to a server error. Please try again or contact an admin."
          : null;

  if (!message) return null;

  return (
    <AdminInlineNotice tone="critical">{message}</AdminInlineNotice>
  );
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
      return "That sign-in link is invalid or has already been used. Please request a new email. If your email provider rewrites links (Safe Links), switch to one-time code sign-in instead of clicking the link.";
    }

    if (error === "access_denied") {
      return params.get("error_description") ?? "Access denied. Please request a new sign-in email.";
    }

    return null;
  }, [hash]);

  if (!message) return null;
  return <AdminInlineNotice tone="critical">{message}</AdminInlineNotice>;
}

export default function LoginPage() {
  const [existingUser, setExistingUser] = useState<{ email: string | null } | null>(null);
  const [postAuthRedirectTo, setPostAuthRedirectTo] = useState<string>("/dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [rememberedEmails, setRememberedEmails] = useState<string[]>([]);
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "error">("idle");
  const [passwordStatus, setPasswordStatus] = useState<"idle" | "error">("idle");
  const [resetStatus, setResetStatus] = useState<"idle" | "sent" | "error">("idle");
  const [authMode, setAuthMode] = useState<"email" | "password">("email");

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const emailMode = useMemo(() => getLoginModeContent("email"), []);
  const passwordMode = useMemo(() => getLoginModeContent("password"), []);
  const modeContent = authMode === "password" ? passwordMode : emailMode;
  const statusNotice = useMemo(
    () => getLoginStatusNotice({ authMode, status, passwordStatus, resetStatus }),
    [authMode, passwordStatus, resetStatus, status],
  );
  const verifyNotice = useMemo(() => getLoginVerifyNotice(verifyStatus), [verifyStatus]);
  const primaryActionLabel = useMemo(
    () => getLoginPrimaryActionLabel({ authMode, isSubmitting, isSigningIn }),
    [authMode, isSigningIn, isSubmitting],
  );

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuthState() {
      try {
        const redirectTo = safePostAuthRedirectPath(new URLSearchParams(window.location.search).get("redirectTo"));
        if (!cancelled) setPostAuthRedirectTo(redirectTo);
      } catch {
        // Ignore; fallback to default.
      }

      try {
        const saved = readRememberedEmails();
        if (!cancelled) {
          setRememberedEmails(saved);
          if (saved.length > 0) {
            setEmail((prev) => (prev.trim().length === 0 ? saved[0] : prev));
          }
        }
      } catch {
        // Ignore.
      }

      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) setExistingUser({ email: user.email ?? null });
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
      const safe = safePostAuthRedirectPath(new URLSearchParams(window.location.search).get("redirectTo"));
      return safe;
    } catch {
      return undefined;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setIsSubmitting(true);
    setStatus("idle");
    setVerifyStatus("idle");
    setPasswordStatus("idle");
    setResetStatus("idle");

    const redirectTo = getRedirectToForRequests();

    try {
      if (rememberEmail) {
        rememberEmailOnDevice(normalizedEmail);
        setRememberedEmails(readRememberedEmails());
      }

      const res = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, redirectTo }),
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }

      setStatus("sent");
    } catch {
      setStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();

    setIsSigningIn(true);
    setPasswordStatus("idle");
    setStatus("idle");
    setVerifyStatus("idle");
    setResetStatus("idle");

    const redirectTo = getRedirectToForRequests();

    try {
      if (rememberEmail) {
        rememberEmailOnDevice(normalizedEmail);
        setRememberedEmails(readRememberedEmails());
      }

      const res = await fetch("/api/auth/signin-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password, redirectTo }),
      });

      if (!res.ok) {
        setPasswordStatus("error");
        return;
      }

      const json = (await res.json().catch(() => null)) as { redirectTo?: string } | null;
      const next = typeof json?.redirectTo === "string" && json.redirectTo.startsWith("/") ? json.redirectTo : "/dashboard";
      window.location.assign(next);
    } catch {
      setPasswordStatus("error");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function onRequestPasswordReset() {
    setIsResettingPassword(true);
    setResetStatus("idle");
    setPasswordStatus("idle");

    try {
      const redirectTo = "/account";

      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, redirectTo }),
      });

      if (!res.ok) {
        setResetStatus("error");
        return;
      }

      setResetStatus("sent");
    } catch {
      setResetStatus("error");
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();

    setIsVerifying(true);
    setVerifyStatus("idle");
    setPasswordStatus("idle");
    setResetStatus("idle");

    const redirectTo = getRedirectToForRequests();

    try {
      if (rememberEmail) {
        rememberEmailOnDevice(normalizedEmail);
        setRememberedEmails(readRememberedEmails());
      }

      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, token, redirectTo }),
      });

      if (!res.ok) {
        setVerifyStatus("error");
        return;
      }

      const json = (await res.json().catch(() => null)) as { redirectTo?: string } | null;
      const next = typeof json?.redirectTo === "string" && json.redirectTo.startsWith("/") ? json.redirectTo : "/dashboard";
      window.location.assign(next);
    } catch {
      setVerifyStatus("error");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <PageShell title="Sign in" showHeader={false} containerClassName="login-shell max-w-6xl">
      <section className="login-page">
        <div aria-hidden className="login-page-backdrop" />

        <div className="login-layout">
          <section className="login-hero-panel" aria-label="Sign-in overview">
            <div className="login-chip-row">
              <span className="login-chip">Invite-only</span>
              <span className="login-chip login-chip-accent">GCCCD</span>
              <span className="login-chip">{modeContent.label}</span>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <p className="login-hero-eyebrow">{modeContent.eyebrow}</p>
                <h1 className="login-hero-title">Sign in</h1>
                <p className="login-hero-subtitle">Campus email only. Clean, fast, and consistent with the rest of ASGC OS.</p>
              </div>

              <div className="login-hero-grid" aria-hidden="true">
                <article className="login-hero-card">
                  <span className="login-hero-card-label">Campus only</span>
                  <strong>@gcccd.edu</strong>
                </article>
                <article className="login-hero-card">
                  <span className="login-hero-card-label">Link or code</span>
                  <strong>Works with Safe Links</strong>
                </article>
                <article className="login-hero-card">
                  <span className="login-hero-card-label">Fast return</span>
                  <strong>Recent email stays nearby</strong>
                </article>
              </div>
            </div>
          </section>

          <div className="login-auth-stack">
            {existingUser ? (
              <AdminSurface
                title="Already signed in"
                description={existingUser.email ?? "Unknown account"}
                className="login-existing-surface"
              >
                <div className="login-action-row">
                  <Button
                    type="button"
                    className="login-primary-button"
                    onClick={() => window.location.assign(postAuthRedirectTo)}
                  >
                    Continue
                  </Button>
                  <form action="/auth/signout" method="post">
                    <Button type="submit" variant="outline" className="login-secondary-button">
                      Sign out
                    </Button>
                  </form>
                </div>
              </AdminSurface>
            ) : null}

            <div className="login-notice-stack">
              <Suspense fallback={null}>
                <AuthCallbackErrorBanner />
              </Suspense>
              <SupabaseHashErrorBanner />
            </div>

            <AdminSurface
              title={modeContent.title}
              description={modeContent.detail}
              className="login-auth-surface"
              contentClassName="login-auth-content"
              action={
                <div className="login-mode-switch" role="tablist" aria-label="Sign-in method">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === "email"}
                    className={authMode === "email" ? "login-mode-button login-mode-button-active" : "login-mode-button"}
                    onClick={() => {
                      setAuthMode("email");
                      setPasswordStatus("idle");
                      setResetStatus("idle");
                    }}
                  >
                    {emailMode.label}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={authMode === "password"}
                    className={authMode === "password" ? "login-mode-button login-mode-button-active" : "login-mode-button"}
                    onClick={() => {
                      setAuthMode("password");
                      setStatus("idle");
                      setVerifyStatus("idle");
                    }}
                  >
                    {passwordMode.label}
                  </button>
                </div>
              }
            >
              {statusNotice ? (
                <AdminInlineNotice tone={statusNotice.tone}>{statusNotice.message}</AdminInlineNotice>
              ) : null}

              <form
                onSubmit={authMode === "password" ? onPasswordSignIn : onSubmit}
                className="login-form-grid"
              >
                <div className="admin-field">
                  <label htmlFor="email" className="login-field-label">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="login-input"
                    placeholder="name@gcccd.edu"
                  />
                </div>

                {authMode === "password" ? (
                  <div className="admin-field">
                    <label htmlFor="password" className="login-field-label">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="login-input"
                      placeholder="Password"
                    />
                  </div>
                ) : null}

                {rememberedEmails.length > 0 ? (
                  <details className="login-details">
                    <summary className="login-details-summary">Recent emails</summary>
                    <div className="login-pill-row">
                      {rememberedEmails.map((saved) => (
                        <button
                          key={saved}
                          type="button"
                          className="login-email-pill"
                          onClick={() => setEmail(saved)}
                        >
                          {saved}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="login-email-pill login-email-pill-muted"
                        onClick={() => {
                          forgetRememberedEmails();
                          setRememberedEmails([]);
                        }}
                      >
                        Forget
                      </button>
                    </div>
                  </details>
                ) : null}

                <label className="login-checkbox-row">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                  />
                  <span>Remember this email</span>
                </label>

                <div className="login-action-row">
                  <Button
                    type="submit"
                    className="login-primary-button"
                    disabled={
                      authMode === "password"
                        ? isSigningIn || normalizedEmail.length === 0 || password.length === 0
                        : isSubmitting || normalizedEmail.length === 0
                    }
                  >
                    {primaryActionLabel}
                  </Button>

                  {authMode === "password" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="login-secondary-button"
                      disabled={isResettingPassword || normalizedEmail.length === 0}
                      onClick={() => void onRequestPasswordReset()}
                    >
                      {isResettingPassword ? "Sending..." : "Reset password"}
                    </Button>
                  ) : null}
                </div>
              </form>
            </AdminSurface>

            {authMode === "email" && status === "sent" ? (
              <AdminSurface
                title="Enter code"
                description="Use the code if the link does not open cleanly."
                className="login-verify-surface"
              >
                <form onSubmit={onVerify} className="login-form-grid">
                  <div className="admin-field">
                    <label htmlFor="token" className="login-field-label">
                      One-time code
                    </label>
                    <input
                      id="token"
                      name="token"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="login-input"
                      placeholder="Code"
                    />
                  </div>

                  <div className="login-action-row">
                    <Button
                      type="submit"
                      className="login-primary-button"
                      disabled={isVerifying || normalizedEmail.length === 0 || token.trim().length === 0}
                    >
                      {isVerifying ? "Verifying..." : "Verify code"}
                    </Button>
                  </div>

                  {verifyNotice ? (
                    <AdminInlineNotice tone={verifyNotice.tone}>{verifyNotice.message}</AdminInlineNotice>
                  ) : null}
                </form>
              </AdminSurface>
            ) : null}

            <details className="login-help-panel">
              <summary className="login-help-summary">Need help?</summary>
              <div className="login-help-copy">
                <p>If your email provider rewrites links, use the one-time code instead.</p>
                <p>After you sign in, you can set a password from Account.</p>
                {process.env.NODE_ENV !== "production" ? (
                  <p className="text-xs text-foreground/60">
                    Local dev emails appear in Supabase Inbucket at http://localhost:54324.
                  </p>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

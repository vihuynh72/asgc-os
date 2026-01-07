"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
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
    <p className="mt-4 max-w-md text-sm text-foreground/70">
      {message}
    </p>
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
  return <p className="mt-4 max-w-md text-sm text-foreground/70">{message}</p>;
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
    <PageShell
      title="Sign in"
      description="Invite-only. Use your campus email to get started."
    >
      {existingUser ? (
        <div className="mt-4 max-w-md rounded-md border p-4">
          <p className="text-sm text-foreground/70">
            You’re already signed in as{" "}
            <span className="font-medium text-foreground">{existingUser.email ?? "unknown"}</span>.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => window.location.assign(postAuthRedirectTo)}>
              Continue
            </Button>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline">
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

      <div className="mt-6 max-w-md space-y-6">
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={authMode === "email" ? "default" : "outline"}
              onClick={() => {
                setAuthMode("email");
                setPasswordStatus("idle");
                setResetStatus("idle");
              }}
            >
              Email sign-in
            </Button>
            <Button
              type="button"
              size="sm"
              variant={authMode === "password" ? "default" : "outline"}
              onClick={() => {
                setAuthMode("password");
                setStatus("idle");
                setVerifyStatus("idle");
              }}
            >
              Password
            </Button>
          </div>

          <form
            onSubmit={authMode === "password" ? onPasswordSignIn : onSubmit}
            className="space-y-4"
          >
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium">
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
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                placeholder="you@example.com"
              />
            </div>

            {authMode === "password" ? (
              <div className="space-y-1">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  placeholder="••••••••"
                />
              </div>
            ) : null}

            {rememberedEmails.length > 0 ? (
              <details className="rounded-md border border-foreground/10 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-foreground/70">
                  Use a recent email
                </summary>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {rememberedEmails.map((saved) => (
                    <Button
                      key={saved}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEmail(saved)}
                    >
                      {saved}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      forgetRememberedEmails();
                      setRememberedEmails([]);
                    }}
                  >
                    Forget
                  </Button>
                </div>
              </details>
            ) : null}

            <label className="flex items-center gap-2 text-sm text-foreground/70">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
              />
              Remember this email
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="submit"
                className="w-full sm:w-auto"
                disabled={
                  authMode === "password"
                    ? isSigningIn || normalizedEmail.length === 0 || password.length === 0
                    : isSubmitting || normalizedEmail.length === 0
                }
              >
                {authMode === "password"
                  ? isSigningIn
                    ? "Signing in..."
                    : "Sign in"
                  : isSubmitting
                    ? "Sending..."
                    : "Send sign-in email"}
              </Button>

              {authMode === "password" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={isResettingPassword || normalizedEmail.length === 0}
                  onClick={() => void onRequestPasswordReset()}
                >
                  {isResettingPassword ? "Sending..." : "Forgot password"}
                </Button>
              ) : null}
            </div>

            {authMode === "password" && passwordStatus === "error" ? (
              <p className="text-sm text-foreground/70">
                Sign-in failed. Check your email/password or use email sign-in.
              </p>
            ) : null}

            {authMode === "password" && resetStatus === "sent" ? (
              <p className="text-sm text-foreground/70">If invited, you’ll get a reset email shortly.</p>
            ) : null}

            {authMode === "password" && resetStatus === "error" ? (
              <p className="text-sm text-foreground/70">
                Could not send a reset email. Please try again.
              </p>
            ) : null}

            {authMode === "email" && status === "sent" ? (
              <p className="text-sm text-foreground/70">
                Check your inbox for a sign-in email. You can also enter the one-time code below.
              </p>
            ) : null}

            {authMode === "email" && status === "error" ? (
              <p className="text-sm text-foreground/70">
                Something went wrong. Please try again.
              </p>
            ) : null}
          </form>
        </div>

        {authMode === "email" && status === "sent" ? (
          <form onSubmit={onVerify} className="space-y-4 rounded-md border p-4">
            <div className="space-y-1">
              <label htmlFor="token" className="text-sm font-medium">
                One-time code
              </label>
              <input
                id="token"
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                placeholder="Enter the code from your email"
              />
            </div>

            <Button type="submit" disabled={isVerifying || normalizedEmail.length === 0 || token.trim().length === 0}>
              {isVerifying ? "Verifying..." : "Verify code"}
            </Button>

            {verifyStatus === "error" ? (
              <p className="text-sm text-foreground/70">
                That code could not be verified. Request a new sign-in email and try again.
              </p>
            ) : null}
          </form>
        ) : null}

        <details className="rounded-md border border-foreground/10 px-3 py-2 text-sm text-foreground/70">
          <summary className="cursor-pointer text-sm font-medium">Trouble signing in?</summary>
          <div className="mt-2 space-y-2 text-sm text-foreground/70">
            <p>If your email provider rewrites links (Safe Links), use the one-time code instead.</p>
            <p>After you sign in, you can set a password from your Account page.</p>
            {process.env.NODE_ENV !== "production" ? (
              <p className="text-xs text-foreground/60">
                Local dev emails are captured in Supabase Inbucket at http://localhost:54324.
              </p>
            ) : null}
          </div>
        </details>
      </div>
    </PageShell>
  );
}

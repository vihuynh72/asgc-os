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
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "error">("idle");

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

    const redirectTo = getRedirectToForRequests();

    try {
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

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();

    setIsVerifying(true);
    setVerifyStatus("idle");

    const redirectTo = getRedirectToForRequests();

    try {
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
      description="Invite-only. If you're allowlisted, you'll receive a sign-in email."
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

      <form onSubmit={onSubmit} className="mt-6 max-w-md space-y-4">
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

        <Button type="submit" disabled={isSubmitting || normalizedEmail.length === 0}>
          {isSubmitting ? "Sending..." : "Send magic link"}
        </Button>

        {status === "sent" ? (
          <p className="text-sm text-foreground/70">
            If this email is invited, you’ll receive a sign-in email shortly. If your email provider
            rewrites links (Safe Links), the link may fail — use a one-time code instead.
          </p>
        ) : null}

        {status === "error" ? (
          <p className="text-sm text-foreground/70">
            Something went wrong. Please try again.
          </p>
        ) : null}
      </form>

      {status === "sent" ? (
        <form onSubmit={onVerify} className="mt-8 max-w-md space-y-4">
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
    </PageShell>
  );
}

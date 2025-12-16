"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    setIsSubmitting(true);
    setStatus("idle");

    try {
      const res = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
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

  return (
    <PageShell
      title="Sign in"
      description="Invite-only. If you're allowlisted, you'll receive a magic link by email."
    >
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
            If this email is invited, you’ll receive a sign-in link shortly.
          </p>
        ) : null}

        {status === "error" ? (
          <p className="text-sm text-foreground/70">
            Something went wrong. Please try again.
          </p>
        ) : null}
      </form>
    </PageShell>
  );
}

"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { safePostAuthRedirectPath } from "@/lib/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type AssuranceLevel = "aal1" | "aal2" | "aal3";

type TotpFactor = {
  id: string;
  friendly_name: string | null;
  created_at: string | null;
};

type EnrollmentState = {
  factorId: string;
  uri: string;
  secret: string | null;
  qrDataUrl: string;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickTotpFactor(raw: unknown): TotpFactor | null {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!obj) return null;

  const totp = obj.totp;
  if (!Array.isArray(totp) || totp.length === 0) return null;

  const first = typeof totp[0] === "object" && totp[0] !== null ? (totp[0] as Record<string, unknown>) : null;
  if (!first) return null;

  const id = safeString(first.id);
  if (!id) return null;

  return {
    id,
    friendly_name: typeof first.friendly_name === "string" ? first.friendly_name : null,
    created_at: typeof first.created_at === "string" ? first.created_at : null,
  };
}

export function MfaClient() {
  const searchParams = useSearchParams();
  const redirectTo = useMemo(() => safePostAuthRedirectPath(searchParams.get("redirectTo")), [searchParams]);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<AssuranceLevel | null>(null);
  const [totpFactor, setTotpFactor] = useState<TotpFactor | null>(null);

  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null);
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isChallenging, setIsChallenging] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  async function loadState() {
    setStatus("loading");
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: aalData, error: aalError }, { data: factorsData, error: factorsError }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);

      if (aalError) throw aalError;
      if (factorsError) throw factorsError;

      setCurrentLevel((aalData?.currentLevel as AssuranceLevel | undefined) ?? null);
      setTotpFactor(pickTotpFactor(factorsData));
      setEnrollment(null);
      setChallengeId(null);
      setCode("");
      setStatus("ready");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load authentication state.";
      setMessage(msg);
      setStatus("error");
    }
  }

  useEffect(() => {
    void loadState();
  }, []);

  async function onEnroll() {
    setIsEnrolling(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;

      const factorId = safeString((data as unknown as Record<string, unknown>)?.id);
      const totp = (data as unknown as Record<string, unknown>)?.totp;
      const totpObj = typeof totp === "object" && totp !== null ? (totp as Record<string, unknown>) : null;
      const uri = safeString(totpObj?.uri);
      const secret = typeof totpObj?.secret === "string" ? totpObj.secret : null;

      if (!factorId || !uri) {
        throw new Error("Could not start 2FA enrollment. Please try again.");
      }

      const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, scale: 6 });
      setEnrollment({ factorId, uri, secret, qrDataUrl });
      setChallengeId(null);
      setCode("");
      setMessage(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not enroll 2FA.";
      setMessage(msg);
    } finally {
      setIsEnrolling(false);
    }
  }

  async function ensureChallenge(factorId: string): Promise<string> {
    if (challengeId) return challengeId;
    setIsChallenging(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error) throw error;
      const id = safeString((data as unknown as Record<string, unknown>)?.id);
      if (!id) throw new Error("Could not start 2FA verification. Please try again.");
      setChallengeId(id);
      return id;
    } finally {
      setIsChallenging(false);
    }
  }

  async function onVerify() {
    const factorId = enrollment?.factorId ?? totpFactor?.id ?? "";
    if (!factorId) return;

    setIsVerifying(true);
    setMessage(null);

    try {
      const challenge = await ensureChallenge(factorId);
      const supabase = getSupabaseBrowserClient();
      const cleaned = code.replace(/\s+/g, "");
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge, code: cleaned });
      if (error) throw error;
      await loadState();
      window.location.assign(redirectTo);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not verify the code.";
      setMessage(msg);
    } finally {
      setIsVerifying(false);
    }
  }

  if (status === "loading") {
    return <p className="text-sm text-foreground/70">Loading…</p>;
  }

  if (status === "error") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground/70">{message ?? "Could not load 2FA status."}</p>
        <Button type="button" variant="outline" onClick={() => void loadState()}>
          Retry
        </Button>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </div>
    );
  }

  if (currentLevel === "aal2") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground/70">2FA is verified for this session.</p>
        <Button type="button" onClick={() => window.location.assign(redirectTo)}>
          Continue
        </Button>
      </div>
    );
  }

  const hasEnrolledTotp = !!totpFactor || !!enrollment;

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-foreground/70">
        Two-factor authentication is required to use ASGC OS.
      </p>

      {!hasEnrolledTotp ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="text-sm font-semibold">Step 1: Add an authenticator app</div>
          <p className="text-sm text-foreground/70">
            Use Google Authenticator, Microsoft Authenticator, 1Password, or any TOTP app.
          </p>
          <Button type="button" disabled={isEnrolling} onClick={() => void onEnroll()}>
            {isEnrolling ? "Starting…" : "Enable 2FA"}
          </Button>
        </div>
      ) : null}

      {enrollment ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="text-sm font-semibold">Step 2: Scan the QR code</div>
          <img
            src={enrollment.qrDataUrl}
            alt="Authenticator QR code"
            className="h-48 w-48 rounded-md border bg-white p-2"
          />
          {enrollment.secret ? (
            <p className="text-xs text-foreground/60">
              Can’t scan? Enter this secret manually: <span className="font-mono">{enrollment.secret}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {totpFactor && !enrollment ? (
        <div className="space-y-2 rounded-md border p-4">
          <div className="text-sm font-semibold">Verify 2FA</div>
          <p className="text-sm text-foreground/70">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>
      ) : null}

      {hasEnrolledTotp ? (
        <div className="space-y-3 rounded-md border p-4">
          <label className="space-y-1">
            <div className="text-sm font-medium">Authenticator code</div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="123456"
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              disabled={isChallenging || isVerifying || code.replace(/\s+/g, "").length < 6}
              onClick={() => void onVerify()}
            >
              {isVerifying ? "Verifying…" : isChallenging ? "Preparing…" : "Verify & continue"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void loadState()}>
              Refresh
            </Button>
          </div>

          {message ? <p className="text-sm text-foreground/70">{message}</p> : null}
        </div>
      ) : null}

      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </div>
  );
}


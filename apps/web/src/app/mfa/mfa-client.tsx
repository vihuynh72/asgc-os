"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { safePostAuthRedirectPath } from "@/lib/redirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type AssuranceLevel = "aal1" | "aal2" | "aal3";

type TotpFactor = {
  id: string;
  status: "verified" | "unverified" | null;
  friendly_name: string | null;
  created_at: string | null;
};

type TotpList = TotpFactor[];

type EnrollmentState = {
  factorId: string;
  uri: string;
  secret: string | null;
  qrDataUrl: string;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeStatus(value: unknown): "verified" | "unverified" | null {
  if (value === "verified") return "verified";
  if (value === "unverified") return "unverified";
  return null;
}

function readTotpFactors(raw: unknown): TotpList {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!obj) return [];

  // Supabase returns:
  // - `all`: verified + unverified factors of all types
  // - `totp`: verified totp factors only
  // We must read `all` to avoid "hidden" unverified factors causing duplicates/lockouts.
  const all = obj.all;
  if (!Array.isArray(all) || all.length === 0) return [];

  return all
    .map((row) => (typeof row === "object" && row !== null ? (row as Record<string, unknown>) : null))
    .map((row) => ({
      id: safeString(row?.id),
      status: safeStatus(row?.status),
      friendly_name: typeof row?.friendly_name === "string" ? row.friendly_name : null,
      created_at: typeof row?.created_at === "string" ? row.created_at : null,
      factor_type: safeString(row?.factor_type),
    }))
    .filter((row) => row.id && row.factor_type === "totp")
    .map((row) => ({
      id: row.id,
      status: row.status,
      friendly_name: row.friendly_name,
      created_at: row.created_at,
    }));
}

function normalizeFriendlyName(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function generateDefaultFriendlyName(existing: TotpList): string {
  const taken = new Set(existing.map((f) => normalizeFriendlyName(f.friendly_name)).filter(Boolean));
  for (let i = 1; i <= 50; i += 1) {
    const candidate = `Authenticator ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `Authenticator ${Date.now()}`;
}

export function MfaClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = useMemo(() => safePostAuthRedirectPath(searchParams.get("redirectTo")), [searchParams]);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState<AssuranceLevel | null>(null);
  const [totpFactors, setTotpFactors] = useState<TotpList>([]);
  const [selectedFactorId, setSelectedFactorId] = useState<string>("");
  const [deviceName, setDeviceName] = useState("");
  const [isRequestingRecovery, setIsRequestingRecovery] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);

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

      const factors = readTotpFactors(factorsData);
      setCurrentLevel((aalData?.currentLevel as AssuranceLevel | undefined) ?? null);
      setTotpFactors(factors);
      setSelectedFactorId((prev) => {
        if (prev && factors.some((f) => f.id === prev)) return prev;
        return factors[0]?.id ?? "";
      });
      setEnrollment(null);
      setChallengeId(null);
      setCode("");
      setRecoveryRequested(false);
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
    setRecoveryRequested(false);

    try {
      const supabase = getSupabaseBrowserClient();
      const friendlyName = deviceName.trim() || generateDefaultFriendlyName(totpFactors);
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName });
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
    const factorId = enrollment?.factorId ?? selectedFactorId;
    if (!factorId) return;

    setIsVerifying(true);
    setMessage(null);
    setRecoveryRequested(false);

    try {
      const challenge = await ensureChallenge(factorId);
      const supabase = getSupabaseBrowserClient();
      const cleaned = code.replace(/\s+/g, "");
      const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge, code: cleaned });
      if (error) throw error;
      await loadState();
      router.push(redirectTo);
    } catch (e) {
      setChallengeId(null);
      const msg = e instanceof Error ? e.message : "Could not verify the code.";
      setMessage(msg);
    } finally {
      setIsVerifying(false);
    }
  }

  async function onRequestRecoveryEmail() {
    setIsRequestingRecovery(true);
    setMessage(null);
    setRecoveryRequested(false);
    try {
      const res = await fetch(`/api/auth/mfa-recovery/request?redirectTo=${encodeURIComponent(redirectTo)}`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { reason?: string } | null;
        const reason =
          json?.reason === "admin_recovery_requires_operator"
            ? "Admin accounts must be recovered by an Advisor/President."
            : "Could not send a recovery email. Please try again.";
        setMessage(reason);
        return;
      }
      setRecoveryRequested(true);
    } catch {
      setMessage("Could not send a recovery email. Please try again.");
    } finally {
      setIsRequestingRecovery(false);
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
      <div className="max-w-md">
        <div className="rounded-xl border bg-background p-5 shadow-sm">
          <p className="text-sm text-foreground/70">2FA verified.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" onClick={() => router.push(redirectTo)}>
              Continue
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/account")}>
              Security settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasEnrolledTotp = totpFactors.length > 0 || !!enrollment;
  const hasVerifiedTotp = totpFactors.some((f) => f.status === "verified");

  return (
    <div className="max-w-md">
      <div className="rounded-xl border bg-background p-5 shadow-sm">
        <div className="space-y-1">
          <div className="text-sm font-semibold">Verify your sign-in</div>
          <p className="text-sm text-foreground/70">
            Enter the 6‑digit code from your authenticator app.
          </p>
        </div>

        {!hasEnrolledTotp ? (
          <div className="mt-5 space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">Device name (optional)</div>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                placeholder="iPhone, Android, Laptop…"
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button type="button" disabled={isEnrolling} onClick={() => void onEnroll()}>
                {isEnrolling ? "Starting…" : "Set up 2FA"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void onRequestRecoveryEmail()} disabled={isRequestingRecovery}>
                {isRequestingRecovery ? "Sending…" : "Recover access"}
              </Button>
            </div>

            <p className="text-xs text-foreground/60">
              Use Google Authenticator, Microsoft Authenticator, 1Password, or any TOTP app.
            </p>
          </div>
        ) : null}

        {enrollment ? (
          <div className="mt-5 space-y-3">
            <div className="text-sm font-medium">Scan the QR code</div>
            <Image
              src={enrollment.qrDataUrl}
              alt="Authenticator QR code"
              width={176}
              height={176}
              unoptimized
              className="h-44 w-44 rounded-md border bg-white p-2"
            />
            {enrollment.secret ? (
              <p className="text-xs text-foreground/60">
                Can’t scan? Enter this secret: <span className="font-mono">{enrollment.secret}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {hasEnrolledTotp ? (
          <div className="mt-5 space-y-3">
            {totpFactors.length > 1 && !enrollment ? (
              <label className="space-y-1">
                <div className="text-xs font-medium text-foreground/70">Authenticator device</div>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedFactorId}
                  onChange={(e) => setSelectedFactorId(e.target.value)}
                >
                  {totpFactors.map((f, idx) => (
                    <option key={f.id} value={f.id}>
                      {normalizeFriendlyName(f.friendly_name) ? normalizeFriendlyName(f.friendly_name) : `Authenticator ${idx + 1}`}
                      {f.status === "unverified" ? " (pending)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="space-y-1">
              <div className="text-sm font-medium">Code</div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-11 w-full rounded-md border bg-background px-3 text-base tracking-widest"
                placeholder="123456"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                disabled={isChallenging || isVerifying || code.replace(/\s+/g, "").length < 6}
                onClick={() => void onVerify()}
              >
                {isVerifying ? "Verifying…" : isChallenging ? "Preparing…" : "Continue"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void onRequestRecoveryEmail()} disabled={isRequestingRecovery}>
                {isRequestingRecovery ? "Sending…" : "Recover access"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => void loadState()}>
                Refresh
              </Button>
            </div>

            {recoveryRequested ? (
              <p className="text-sm text-foreground/70">
                Check your email for a recovery link. Open it to reset 2FA.
              </p>
            ) : null}

            {message ? <p className="text-sm text-foreground/70">{message}</p> : null}

            <p className="text-xs text-foreground/60">
              {hasVerifiedTotp ? "Add a backup authenticator in " : "If you started setup earlier, verify the pending device here, or "}
              <button type="button" className="underline" onClick={() => router.push("/account")}>
                Account settings
              </button>
              .
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3">
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

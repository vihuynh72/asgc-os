"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type TotpFactor = {
  id: string;
  status: "verified" | "unverified" | null;
  friendly_name: string | null;
  created_at: string | null;
};

type EnrollmentState = {
  factorId: string;
  qrDataUrl: string;
  secret: string | null;
};

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeStatus(value: unknown): "verified" | "unverified" | null {
  if (value === "verified") return "verified";
  if (value === "unverified") return "unverified";
  return null;
}

function readTotpFactors(raw: unknown): TotpFactor[] {
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : null;
  if (!obj) return [];
  const all = obj.all;
  if (!Array.isArray(all)) return [];
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
    .map(({ factor_type: _ignored, ...rest }) => rest);
}

function normalizeFriendlyName(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function generateDefaultFriendlyName(existing: TotpFactor[]): string {
  const taken = new Set(existing.map((f) => normalizeFriendlyName(f.friendly_name)).filter(Boolean));
  for (let i = 1; i <= 50; i += 1) {
    const candidate = `Authenticator ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `Authenticator ${Date.now()}`;
}

export function SecurityPanel() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [factors, setFactors] = useState<TotpFactor[]>([]);

  const [deviceName, setDeviceName] = useState("");
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null);
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);
  const [isSendingRecovery, setIsSendingRecovery] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);

  const canManage = useMemo(() => factors.length > 0, [factors]);

  async function load() {
    setStatus("loading");
    setMessage(null);
    setRecoverySent(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: factorsData, error: factorsError }, { data: userData, error: userError }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.getUser(),
      ]);
      if (factorsError) throw factorsError;
      if (userError) throw userError;

      const userId = userData.user?.id;
      if (!userId) {
        setStatus("error");
        setMessage("Not signed in.");
        return;
      }

      const { data: adminData, error: adminErr } = await supabase.rpc("is_admin", { _uid: userId });
      if (adminErr) throw adminErr;

      setIsAdmin(!!adminData);
      setFactors(readTotpFactors(factorsData));
      setEnrollment(null);
      setChallengeId(null);
      setCode("");
      setStatus("ready");
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Could not load security settings.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onStartAdd() {
    setIsAdding(true);
    setMessage(null);
    setRecoverySent(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const friendlyName = deviceName.trim() || generateDefaultFriendlyName(factors);
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName });
      if (error) throw error;

      const totp = (data as unknown as Record<string, unknown>)?.totp;
      const totpObj = typeof totp === "object" && totp !== null ? (totp as Record<string, unknown>) : null;
      const uri = safeString(totpObj?.uri);
      const secret = typeof totpObj?.secret === "string" ? totpObj.secret : null;
      const factorId = safeString((data as unknown as Record<string, unknown>)?.id);

      if (!uri || !factorId) throw new Error("Could not start enrollment.");

      const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, scale: 6 });
      setEnrollment({ factorId, qrDataUrl, secret });
      setChallengeId(null);
      setCode("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start enrollment.");
    } finally {
      setIsAdding(false);
    }
  }

  async function ensureChallenge(factorId: string): Promise<string> {
    if (challengeId) return challengeId;
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error) throw error;
    const id = safeString((data as unknown as Record<string, unknown>)?.id);
    if (!id) throw new Error("Could not start verification.");
    setChallengeId(id);
    return id;
  }

  async function onVerifyNew() {
    if (!enrollment) return;
    setIsVerifying(true);
    setMessage(null);
    try {
      const challenge = await ensureChallenge(enrollment.factorId);
      const supabase = getSupabaseBrowserClient();
      const cleaned = code.replace(/\s+/g, "");
      const { error } = await supabase.auth.mfa.verify({ factorId: enrollment.factorId, challengeId: challenge, code: cleaned });
      if (error) throw error;
      await load();
    } catch (e) {
      setChallengeId(null);
      setMessage(e instanceof Error ? e.message : "Could not verify the code.");
    } finally {
      setIsVerifying(false);
    }
  }

  async function onRemove(id: string) {
    setIsRemoving(id);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not remove device.");
    } finally {
      setIsRemoving(null);
    }
  }

  async function onSendRecovery() {
    setIsSendingRecovery(true);
    setMessage(null);
    setRecoverySent(false);
    try {
      const res = await fetch("/api/auth/mfa-recovery/request?redirectTo=/account", { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { reason?: string } | null;
        const reason =
          json?.reason === "admin_recovery_requires_operator"
            ? "Admin accounts must be recovered by an Advisor/President."
            : "Could not send a recovery email.";
        setMessage(reason);
        return;
      }
      setRecoverySent(true);
    } catch {
      setMessage("Could not send a recovery email.");
    } finally {
      setIsSendingRecovery(false);
    }
  }

  if (status === "loading") return <p className="text-sm text-foreground/70">Loading…</p>;
  if (status === "error") return <p className="text-sm text-foreground/70">{message ?? "Could not load security settings."}</p>;

      return (
    <section className="rounded-xl border bg-background p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Security</h2>
          <p className="mt-1 text-sm text-foreground/70">
            Manage two-factor authentication for your account.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        <div className="text-xs font-medium text-foreground/60">Authenticator devices</div>
        {factors.length === 0 ? (
          <p className="text-sm text-foreground/70">No devices enrolled yet.</p>
        ) : (
          <ul className="space-y-2">
            {factors.map((f, idx) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground/10 px-3 py-2">
                <div className="text-sm">
                  <div className="font-medium">
                    {normalizeFriendlyName(f.friendly_name) ? normalizeFriendlyName(f.friendly_name) : `Authenticator ${idx + 1}`}
                    {f.status === "unverified" ? " (pending)" : ""}
                  </div>
                  <div className="text-xs text-foreground/60">{f.created_at ? `Added ${new Date(f.created_at).toLocaleString()}` : null}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRemoving === f.id}
                  onClick={() => void onRemove(f.id)}
                >
                  {isRemoving === f.id ? "Removing…" : "Remove"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {factors.some((f) => f.status === "unverified") ? (
          <p className="text-xs text-foreground/60">
            Pending devices are not active until verified. Finish setup on <button type="button" className="underline" onClick={() => window.location.assign("/mfa?redirectTo=/account")}>the 2FA page</button>.
          </p>
        ) : null}
      </div>

      <div className="mt-6 space-y-3">
        <div className="text-xs font-medium text-foreground/60">Add a backup device</div>
        {!enrollment ? (
          <div className="space-y-3">
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              placeholder="Device name (optional)"
            />
            <Button type="button" disabled={isAdding} onClick={() => void onStartAdd()}>
              {isAdding ? "Starting…" : "Add authenticator"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm font-medium">Scan this QR code</div>
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
                Or enter this secret: <span className="font-mono">{enrollment.secret}</span>
              </p>
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
                disabled={isVerifying || code.replace(/\s+/g, "").length < 6}
                onClick={() => void onVerifyNew()}
              >
                {isVerifying ? "Verifying…" : "Verify & add"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEnrollment(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <div className="text-xs font-medium text-foreground/60">Recovery</div>
        {isAdmin ? (
          <p className="text-sm text-foreground/70">
            Admin accounts must be recovered by an Advisor/President.
          </p>
        ) : (
          <div className="space-y-2">
            <Button type="button" variant="outline" disabled={isSendingRecovery} onClick={() => void onSendRecovery()}>
              {isSendingRecovery ? "Sending…" : "Send recovery email"}
            </Button>
            {recoverySent ? (
              <p className="text-sm text-foreground/70">
                Recovery email sent. Open the link to reset 2FA.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {message ? <p className="mt-4 text-sm text-foreground/70">{message}</p> : null}
      {!canManage ? (
        <p className="mt-4 text-xs text-foreground/60">
          Tip: Add at least two authenticators (e.g., phone + laptop) to avoid lockouts.
        </p>
      ) : null}
    </section>
  );
}

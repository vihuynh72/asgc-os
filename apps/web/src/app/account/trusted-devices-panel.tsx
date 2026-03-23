"use client";

import { useEffect, useState } from "react";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { Button } from "@/components/ui/button";

type TrustedDevice = {
  id: string;
  label: string;
  userAgent: string | null;
  lastSeenAt: string;
  expiresAt: string;
  createdAt: string;
  isCurrentDevice: boolean;
};

function formatWhen(value: string | null) {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function TrustedDevicesPanel() {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [notice, setNotice] = useState<{ tone: "good" | "critical"; message: string } | null>(null);

  async function refresh() {
    setLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/account/trusted-devices");
      const json = (await response.json().catch(() => null)) as { devices?: TrustedDevice[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not load trusted devices.");
      }
      setDevices(json?.devices ?? []);
    } catch (error) {
      setNotice({
        tone: "critical",
        message: error instanceof Error ? error.message : "Could not load trusted devices.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function revokeDevice(deviceId: string) {
    setSavingId(deviceId);
    setNotice(null);
    try {
      const response = await fetch(`/api/account/trusted-devices/${deviceId}`, {
        method: "DELETE",
      });
      const json = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(json?.error ?? "Could not revoke trusted device.");
      }
      setDevices((current) => current.filter((device) => device.id !== deviceId));
      setNotice({ tone: "good", message: "Trusted device removed." });
    } catch (error) {
      setNotice({
        tone: "critical",
        message: error instanceof Error ? error.message : "Could not revoke trusted device.",
      });
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="rounded-[1.5rem] border border-foreground/10 bg-white/72 p-5 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.38)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Trusted devices</h2>
          <p className="mt-1 text-sm text-foreground/65">
            Browsers you trusted during the new password-first sign-in flow. Trust lasts 30 days unless you revoke it.
          </p>
        </div>
        <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {notice ? <div className="mt-4"><AdminInlineNotice tone={notice.tone}>{notice.message}</AdminInlineNotice></div> : null}

      <div className="mt-4 space-y-3">
        {devices.length === 0 && !loading ? (
          <div className="rounded-[1.2rem] border border-dashed border-foreground/15 px-4 py-4 text-sm text-foreground/65">
            No trusted devices yet.
          </div>
        ) : null}

        {devices.map((device) => (
          <article
            key={device.id}
            className="rounded-[1.35rem] border border-foreground/10 bg-white/78 px-4 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-foreground">{device.label}</div>
                  {device.isCurrentDevice ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Current device
                    </span>
                  ) : null}
                </div>
                {device.userAgent ? <div className="text-sm text-foreground/58">{device.userAgent}</div> : null}
                <div className="text-xs text-foreground/55">
                  Last seen {formatWhen(device.lastSeenAt)} • Expires {formatWhen(device.expiresAt)}
                </div>
              </div>

              <Button
                variant="outline"
                className="h-10 rounded-full px-4"
                onClick={() => void revokeDevice(device.id)}
                disabled={savingId === device.id}
              >
                {savingId === device.id ? "Removing..." : "Revoke"}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

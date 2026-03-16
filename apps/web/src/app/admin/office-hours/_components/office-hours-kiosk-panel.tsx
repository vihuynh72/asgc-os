"use client";

import { useState } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";
import type { OfficeConfigRow } from "@/lib/admin/server";

type MemberRow = {
  user_id: string;
  display_name: string;
  role_key: "president" | "executive" | "board_member";
  role_label: string;
  display_title: string | null;
  phone_configured: boolean;
  phone_last4: string | null;
  phone_updated_at: string | null;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(json?.error ?? `Request failed: ${response.status}`);
  }
  return json as T;
}

function updatedLabel(value: string | null): string {
  if (!value) return "Not configured";
  try {
    return `Updated ${new Date(value).toLocaleString()}`;
  } catch {
    return value;
  }
}

export function OfficeHoursKioskPanel({
  initialMembers,
  initialConfig,
  smsEnvReady,
}: {
  initialMembers: MemberRow[];
  initialConfig: OfficeConfigRow;
  smsEnvReady: boolean;
}) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [savingMemberId, setSavingMemberId] = useState<string>("");
  const [configSaving, setConfigSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "warning"; message: string } | null>(null);
  const [config, setConfig] = useState({
    kiosk_sms_enabled: initialConfig.kiosk_sms_enabled,
    kiosk_otp_ttl_minutes: initialConfig.kiosk_otp_ttl_minutes,
    kiosk_checkout_reminder_interval_minutes: initialConfig.kiosk_checkout_reminder_interval_minutes,
  });

  async function savePhone(userId: string, phone: string | null) {
    setSavingMemberId(userId);
    setNotice(null);

    try {
      const data = await fetchJson<{ phone_configured: boolean; phone_last4: string | null; phone_updated_at: string | null }>(
        "/api/admin/office-hours/kiosk-phones",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId, phone }),
        },
      );

      setMembers((current) =>
        current.map((member) =>
          member.user_id === userId
            ? {
                ...member,
                phone_configured: data.phone_configured,
                phone_last4: data.phone_last4,
                phone_updated_at: data.phone_updated_at,
              }
            : member,
        ),
      );
      setPhoneDrafts((current) => ({ ...current, [userId]: "" }));
      setNotice({ tone: "good", message: phone ? "Kiosk phone updated." : "Kiosk phone removed." });
    } catch (e) {
      setNotice({ tone: "warning", message: e instanceof Error ? e.message : "Could not save kiosk phone." });
    } finally {
      setSavingMemberId("");
    }
  }

  async function saveConfig() {
    setConfigSaving(true);
    setNotice(null);

    try {
      await fetchJson("/api/admin/office-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kiosk_sms_enabled: config.kiosk_sms_enabled,
          kiosk_otp_ttl_minutes: Number(config.kiosk_otp_ttl_minutes),
          kiosk_checkout_reminder_interval_minutes: Number(config.kiosk_checkout_reminder_interval_minutes),
        }),
      });
      setNotice({ tone: "good", message: "Kiosk SMS settings saved." });
    } catch (e) {
      setNotice({ tone: "warning", message: e instanceof Error ? e.message : "Could not save kiosk settings." });
    } finally {
      setConfigSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {notice ? <AdminInlineNotice tone={notice.tone}>{notice.message}</AdminInlineNotice> : null}

      {!smsEnvReady ? (
        <AdminInlineNotice tone="critical">
          Twilio env vars are missing on the server. The kiosk can be configured here, but OTP and reminder delivery will fail until the server env is updated.
        </AdminInlineNotice>
      ) : (
        <AdminInlineNotice tone="good">
          Twilio env vars are present. Kiosk OTP and reminder delivery can use the configured Messaging Service.
        </AdminInlineNotice>
      )}

      <AdminSurface
        title="Kiosk SMS settings"
        description="Keep the OTP expiry and the hourly reminder cadence in the same workspace as the phone allowlist."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex items-center gap-3 rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-white/80 px-4 py-4 text-sm text-foreground/72">
            <input
              type="checkbox"
              checked={config.kiosk_sms_enabled}
              onChange={(event) => setConfig((current) => ({ ...current, kiosk_sms_enabled: event.target.checked }))}
            />
            Enable kiosk SMS
          </label>

          <AdminField label="OTP expiry (minutes)">
            <input
              type="number"
              min={1}
              max={30}
              value={config.kiosk_otp_ttl_minutes}
              onChange={(event) =>
                setConfig((current) => ({ ...current, kiosk_otp_ttl_minutes: Number(event.target.value || 5) }))
              }
            />
          </AdminField>

          <AdminField label="Checkout reminder interval">
            <input
              type="number"
              min={15}
              max={240}
              step={15}
              value={config.kiosk_checkout_reminder_interval_minutes}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  kiosk_checkout_reminder_interval_minutes: Number(event.target.value || 60),
                }))
              }
            />
          </AdminField>
        </div>

        <div className="mt-5 flex justify-end">
          <Button className="h-11 rounded-full px-5" onClick={() => void saveConfig()} disabled={configSaving}>
            {configSaving ? "Saving..." : "Save kiosk settings"}
          </Button>
        </div>
      </AdminSurface>

      <AdminSurface
        title="Approved kiosk phones"
        description="Phone numbers stay masked after they are saved. Enter a replacement number when one changes, or clear the row to remove kiosk access."
      >
        <div className="space-y-4">
          {members.map((member) => {
            const draft = phoneDrafts[member.user_id] ?? "";
            const isSaving = savingMemberId === member.user_id;
            return (
              <div
                key={member.user_id}
                className="grid gap-4 rounded-[1.35rem] border border-[var(--admin-border-soft)] bg-white/78 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]"
              >
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-foreground">{member.display_name}</div>
                  <div className="text-xs uppercase tracking-[0.12em] text-foreground/50">{member.role_label}</div>
                  <div className="text-sm text-foreground/65">
                    {member.phone_configured && member.phone_last4
                      ? `Configured • ***-***-${member.phone_last4}`
                      : "No kiosk phone configured"}
                  </div>
                  <div className="text-xs text-foreground/48">{updatedLabel(member.phone_updated_at)}</div>
                </div>

                <AdminField label="New approved phone" hint="US numbers only">
                  <input
                    placeholder="(619) 555-1234"
                    value={draft}
                    onChange={(event) =>
                      setPhoneDrafts((current) => ({ ...current, [member.user_id]: event.target.value }))
                    }
                  />
                </AdminField>

                <div className="flex flex-wrap items-end gap-2">
                  <Button
                    className="h-11 rounded-full px-4"
                    onClick={() => void savePhone(member.user_id, draft || null)}
                    disabled={isSaving || (!draft && !member.phone_configured)}
                  >
                    {isSaving ? "Saving..." : draft ? "Save phone" : "Clear phone"}
                  </Button>
                  {member.phone_configured ? (
                    <Button
                      variant="outline"
                      className="h-11 rounded-full px-4"
                      onClick={() => void savePhone(member.user_id, null)}
                      disabled={isSaving}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </AdminSurface>
    </div>
  );
}

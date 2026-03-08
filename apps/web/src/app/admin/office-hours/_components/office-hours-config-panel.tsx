"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";
import type { OfficeConfigRow, OfficeLocationRow } from "@/lib/admin/server";

import { OfficeHoursSectionNav } from "./office-hours-section-nav";

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
] as const;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

export function OfficeHoursConfigPanel({
  initialOfficeConfig,
  initialOfficeLocation,
}: {
  initialOfficeConfig: OfficeConfigRow | null;
  initialOfficeLocation: OfficeLocationRow | null;
}) {
  const [form, setForm] = useState({
    name: initialOfficeLocation?.name ?? "",
    timezone: initialOfficeLocation?.timezone ?? "America/Los_Angeles",
    lat: initialOfficeLocation?.lat ?? 0,
    lon: initialOfficeLocation?.lon ?? 0,
    radius_m: initialOfficeLocation?.radius_m ?? 0,
    grace_radius_m: initialOfficeLocation?.grace_radius_m ?? 0,
    quiet_hours_enabled: initialOfficeConfig?.quiet_hours_enabled ?? false,
    quiet_hours_start_local: initialOfficeConfig?.quiet_hours_start_local ?? "18:00:00",
    quiet_hours_end_local: initialOfficeConfig?.quiet_hours_end_local ?? "07:00:00",
    weekly_hours_reminder_enabled: initialOfficeConfig?.weekly_hours_reminder_enabled ?? false,
    weekly_hours_reminder_weekday: initialOfficeConfig?.weekly_hours_reminder_weekday ?? 5,
    weekly_hours_reminder_time_local: initialOfficeConfig?.weekly_hours_reminder_time_local ?? "12:00:00",
    office_hours_allow_weekends: initialOfficeConfig?.office_hours_allow_weekends ?? false,
    office_hours_allowed_weekdays: initialOfficeConfig?.office_hours_allowed_weekdays ?? [1, 2, 3, 4, 5],
    office_hours_extra_allowed_dates: (initialOfficeConfig?.office_hours_extra_allowed_dates ?? []).join("\n"),
  });
  const [feedback, setFeedback] = useState<{ tone: "positive" | "warning"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await fetchJson("/api/admin/office-config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          timezone: form.timezone,
          lat: Number(form.lat),
          lon: Number(form.lon),
          radius_m: Number(form.radius_m),
          grace_radius_m: Number(form.grace_radius_m),
          quiet_hours_enabled: form.quiet_hours_enabled,
          quiet_hours_start_local: form.quiet_hours_start_local,
          quiet_hours_end_local: form.quiet_hours_end_local,
          weekly_hours_reminder_enabled: form.weekly_hours_reminder_enabled,
          weekly_hours_reminder_weekday: Number(form.weekly_hours_reminder_weekday),
          weekly_hours_reminder_time_local: form.weekly_hours_reminder_time_local,
          office_hours_allow_weekends: form.office_hours_allow_weekends,
          office_hours_allowed_weekdays: form.office_hours_allowed_weekdays,
          office_hours_extra_allowed_dates: form.office_hours_extra_allowed_dates
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      setFeedback({ tone: "positive", message: "Office Hours configuration saved." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not save configuration." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <OfficeHoursSectionNav activeId="config" />

      {feedback ? <AdminInlineNotice tone={feedback.tone}>{feedback.message}</AdminInlineNotice> : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
        <AdminSurface title="Primary office" description="Keep the physical location and geofence readable instead of burying them in a wide settings wall.">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AdminField label="Office name">
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </AdminField>
            <AdminField label="Timezone">
              <input
                value={form.timezone}
                onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                placeholder="America/Los_Angeles"
              />
            </AdminField>
            <AdminField label="Radius (meters)">
              <input
                type="number"
                min={0}
                value={form.radius_m}
                onChange={(event) => setForm((current) => ({ ...current, radius_m: Number(event.target.value || 0) }))}
              />
            </AdminField>
            <AdminField label="Grace radius (meters)">
              <input
                type="number"
                min={0}
                value={form.grace_radius_m}
                onChange={(event) => setForm((current) => ({ ...current, grace_radius_m: Number(event.target.value || 0) }))}
              />
            </AdminField>
            <AdminField label="Latitude">
              <input
                type="number"
                value={form.lat}
                onChange={(event) => setForm((current) => ({ ...current, lat: Number(event.target.value || 0) }))}
              />
            </AdminField>
            <AdminField label="Longitude">
              <input
                type="number"
                value={form.lon}
                onChange={(event) => setForm((current) => ({ ...current, lon: Number(event.target.value || 0) }))}
              />
            </AdminField>
          </div>
        </AdminSurface>

        <AdminSurface title="Availability and reminders" description="Reminder timing and allowed days stay grouped together so weekly policy is easy to reason about.">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-4">
              <label className="flex items-center gap-3 text-sm text-foreground/72">
                <input
                  type="checkbox"
                  checked={form.quiet_hours_enabled}
                  onChange={(event) => setForm((current) => ({ ...current, quiet_hours_enabled: event.target.checked }))}
                />
                Enable quiet hours
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="Quiet start">
                  <input
                    type="time"
                    value={form.quiet_hours_start_local.slice(0, 5)}
                    onChange={(event) => setForm((current) => ({ ...current, quiet_hours_start_local: `${event.target.value}:00` }))}
                  />
                </AdminField>
                <AdminField label="Quiet end">
                  <input
                    type="time"
                    value={form.quiet_hours_end_local.slice(0, 5)}
                    onChange={(event) => setForm((current) => ({ ...current, quiet_hours_end_local: `${event.target.value}:00` }))}
                  />
                </AdminField>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-center gap-3 text-sm text-foreground/72">
                <input
                  type="checkbox"
                  checked={form.weekly_hours_reminder_enabled}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, weekly_hours_reminder_enabled: event.target.checked }))
                  }
                />
                Enable weekly reminder
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="Reminder weekday">
                  <select
                    value={form.weekly_hours_reminder_weekday}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, weekly_hours_reminder_weekday: Number(event.target.value) }))
                    }
                  >
                    {WEEKDAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="Reminder time">
                  <input
                    type="time"
                    value={form.weekly_hours_reminder_time_local.slice(0, 5)}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, weekly_hours_reminder_time_local: `${event.target.value}:00` }))
                    }
                  />
                </AdminField>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="flex items-center gap-3 text-sm text-foreground/72">
              <input
                type="checkbox"
                checked={form.office_hours_allow_weekends}
                onChange={(event) => setForm((current) => ({ ...current, office_hours_allow_weekends: event.target.checked }))}
              />
              Allow weekends
            </label>

            <div className="grid gap-3 md:grid-cols-5">
              {WEEKDAY_OPTIONS.map((option) => {
                const checked = form.office_hours_allowed_weekdays.includes(option.value);
                return (
                  <label key={option.value} className="flex items-center gap-3 rounded-[1.1rem] border border-[var(--admin-border-soft)] bg-white/70 px-4 py-3 text-sm text-foreground/72">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          office_hours_allowed_weekdays: event.target.checked
                            ? [...current.office_hours_allowed_weekdays, option.value].sort((a, b) => a - b)
                            : current.office_hours_allowed_weekdays.filter((value) => value !== option.value),
                        }))
                      }
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>

            <AdminField label="Extra allowed dates" hint="One YYYY-MM-DD per line">
              <textarea
                rows={5}
                value={form.office_hours_extra_allowed_dates}
                onChange={(event) => setForm((current) => ({ ...current, office_hours_extra_allowed_dates: event.target.value }))}
              />
            </AdminField>
          </div>
        </AdminSurface>

        <Button className="h-12 rounded-full px-5" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save configuration"}
        </Button>
      </form>
    </div>
  );
}

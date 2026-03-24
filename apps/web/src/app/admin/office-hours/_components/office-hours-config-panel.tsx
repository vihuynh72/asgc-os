"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
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
    <div className="space-y-6">
      <OfficeHoursSectionNav activeId="config" />

      {feedback ? <AdminInlineNotice tone={feedback.tone}>{feedback.message}</AdminInlineNotice> : null}

      <form className="space-y-8 max-w-2xl" onSubmit={handleSubmit}>
        {/* Location */}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Location</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-foreground/75">Office name</span>
              <input
                className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-foreground/75">Timezone</span>
              <input
                className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                value={form.timezone}
                onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                placeholder="America/Los_Angeles"
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-foreground/75">Latitude</span>
              <input
                type="number"
                className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                value={form.lat}
                onChange={(event) => setForm((current) => ({ ...current, lat: Number(event.target.value || 0) }))}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-foreground/75">Longitude</span>
              <input
                type="number"
                className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                value={form.lon}
                onChange={(event) => setForm((current) => ({ ...current, lon: Number(event.target.value || 0) }))}
              />
            </label>
          </div>
        </section>

        {/* Geofencing */}
        <section className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Geofencing</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-foreground/75">Radius (meters)</span>
              <input
                type="number"
                min={0}
                className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                value={form.radius_m}
                onChange={(event) => setForm((current) => ({ ...current, radius_m: Number(event.target.value || 0) }))}
              />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium text-foreground/75">Grace radius (meters)</span>
              <input
                type="number"
                min={0}
                className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                value={form.grace_radius_m}
                onChange={(event) => setForm((current) => ({ ...current, grace_radius_m: Number(event.target.value || 0) }))}
              />
            </label>
          </div>
        </section>

        {/* Policy */}
        <section className="space-y-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/40">Policy</h3>

          {/* Quiet hours */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm text-foreground/70">
              <input
                type="checkbox"
                checked={form.quiet_hours_enabled}
                onChange={(event) => setForm((current) => ({ ...current, quiet_hours_enabled: event.target.checked }))}
              />
              <span className="font-medium">Enable quiet hours</span>
            </label>
            {form.quiet_hours_enabled && (
              <div className="ml-6 grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-foreground/75">Start</span>
                  <input
                    type="time"
                    className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                    value={form.quiet_hours_start_local.slice(0, 5)}
                    onChange={(event) => setForm((current) => ({ ...current, quiet_hours_start_local: `${event.target.value}:00` }))}
                  />
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-foreground/75">End</span>
                  <input
                    type="time"
                    className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                    value={form.quiet_hours_end_local.slice(0, 5)}
                    onChange={(event) => setForm((current) => ({ ...current, quiet_hours_end_local: `${event.target.value}:00` }))}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Weekly reminder */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm text-foreground/70">
              <input
                type="checkbox"
                checked={form.weekly_hours_reminder_enabled}
                onChange={(event) => setForm((current) => ({ ...current, weekly_hours_reminder_enabled: event.target.checked }))}
              />
              <span className="font-medium">Enable weekly reminder</span>
            </label>
            {form.weekly_hours_reminder_enabled && (
              <div className="ml-6 grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-foreground/75">Day</span>
                  <select
                    className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                    value={form.weekly_hours_reminder_weekday}
                    onChange={(event) => setForm((current) => ({ ...current, weekly_hours_reminder_weekday: Number(event.target.value) }))}
                  >
                    {WEEKDAY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium text-foreground/75">Time</span>
                  <input
                    type="time"
                    className="h-10 w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm"
                    value={form.weekly_hours_reminder_time_local.slice(0, 5)}
                    onChange={(event) => setForm((current) => ({ ...current, weekly_hours_reminder_time_local: `${event.target.value}:00` }))}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Allowed days */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm text-foreground/70">
              <input
                type="checkbox"
                checked={form.office_hours_allow_weekends}
                onChange={(event) => setForm((current) => ({ ...current, office_hours_allow_weekends: event.target.checked }))}
              />
              <span className="font-medium">Allow weekends</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((option) => {
                const checked = form.office_hours_allowed_weekdays.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                      checked
                        ? "border-foreground/20 bg-foreground text-background"
                        : "border-[var(--admin-border-soft)] bg-white text-foreground/65 hover:border-[var(--admin-border-strong)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
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
          </div>

          {/* Extra dates */}
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-foreground/75">Extra allowed dates</span>
            <span className="ml-2 text-xs text-foreground/45">One YYYY-MM-DD per line</span>
            <textarea
              rows={4}
              className="w-full rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 py-2.5 text-sm"
              value={form.office_hours_extra_allowed_dates}
              onChange={(event) => setForm((current) => ({ ...current, office_hours_extra_allowed_dates: event.target.value }))}
            />
          </label>
        </section>

        <Button className="h-10 rounded-full px-5" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save configuration"}
        </Button>
      </form>
    </div>
  );
}

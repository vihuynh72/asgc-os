"use client";

import Link from "next/link";
import { startTransition, useMemo, useState } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";
import type { OfficeConfigRow, OfficeLocationRow, UserRow } from "@/lib/admin/server";
import { getOfficeHoursLabPresets, type OfficeHoursLabRequest, type OfficeHoursLabResult } from "@/lib/office-hours-lab";
import { cn } from "@/lib/utils";

type KioskLabMember = {
  user_id: string;
  display_name: string;
  role_label: string;
  phone_last4: string | null;
};

type SuiteEntry = {
  presetId: string;
  label: string;
  verdict: OfficeHoursLabResult["verdict"] | "pending";
  headline: string;
};

const SCENARIO_OPTIONS = [
  { value: "allowed_day", label: "Allowed Day" },
  { value: "geofence", label: "Geofence" },
  { value: "member_flow", label: "Member Flow" },
  { value: "member_check_in", label: "Member Check-In" },
  { value: "kiosk_status", label: "Kiosk Status" },
  { value: "kiosk_check_in", label: "Kiosk Check-In" },
  { value: "presence_ping", label: "Presence Ping" },
  { value: "presence_heartbeat", label: "Presence Heartbeat" },
  { value: "shift_creation", label: "Shift Creation" },
  { value: "admin_close_session", label: "Admin Close Session" },
] as const;

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

const LIVE_SUPPORTED = new Set([
  "member_check_in",
  "kiosk_status",
  "kiosk_check_in",
  "presence_ping",
  "presence_heartbeat",
  "shift_creation",
  "admin_close_session",
]);

function scenarioLabel(kind: OfficeHoursLabRequest["kind"]) {
  return SCENARIO_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function toDatetimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function supportsLive(kind: OfficeHoursLabRequest["kind"]) {
  return LIVE_SUPPORTED.has(kind);
}

function verdictClassName(verdict: SuiteEntry["verdict"] | OfficeHoursLabResult["verdict"]) {
  if (verdict === "pass") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (verdict === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  if (verdict === "pending") return "border-black/8 bg-white text-foreground/55";
  return "border-red-200 bg-red-50 text-red-700";
}

function buildDefaultRequest({
  kind,
  timestamp,
  defaultUserId,
  defaultKioskUserId,
  officeLocation,
}: {
  kind: OfficeHoursLabRequest["kind"];
  timestamp: string;
  defaultUserId: string | null;
  defaultKioskUserId: string | null;
  officeLocation: OfficeLocationRow | null;
}): OfficeHoursLabRequest {
  const resolvedUserId = kind === "kiosk_status" || kind === "kiosk_check_in" ? defaultKioskUserId : defaultUserId;
  return {
    kind,
    timestamp,
    userId: resolvedUserId,
    lat: officeLocation?.lat ?? undefined,
    lon: officeLocation?.lon ?? undefined,
    hasPhoto: false,
    preflightReady: false,
    preflightAllowed: false,
    hasOpenSession: false,
    phoneMatched: true,
    shift: {
      userId: defaultUserId,
      startsAt: timestamp,
      endsAt: new Date(new Date(timestamp).getTime() + 60 * 60_000).toISOString(),
      officeLocationId: officeLocation?.id ?? undefined,
    },
    adminClose: {
      checkoutAt: timestamp,
      excludeFromTotals: false,
      reason: "Office Hours lab verification",
    },
    session: {
      checkinAt: new Date(new Date(timestamp).getTime() - 60 * 60_000).toISOString(),
      lastPresenceAt: new Date(new Date(timestamp).getTime() - 20 * 60_000).toISOString(),
      requiresPresence: true,
    },
  };
}

function hydrateRequestWithDefaults({
  request,
  defaultUserId,
  defaultKioskUserId,
  officeLocation,
}: {
  request: OfficeHoursLabRequest;
  defaultUserId: string | null;
  defaultKioskUserId: string | null;
  officeLocation: OfficeLocationRow | null;
}) {
  const base = buildDefaultRequest({
    kind: request.kind,
    timestamp: request.timestamp,
    defaultUserId,
    defaultKioskUserId,
    officeLocation,
  });

  const baseShift = base.shift ?? {
    userId: defaultUserId,
    startsAt: request.timestamp,
    endsAt: request.timestamp,
    officeLocationId: officeLocation?.id ?? undefined,
  };
  const baseAdminClose = base.adminClose ?? {
    checkoutAt: request.timestamp,
    excludeFromTotals: false,
    reason: "Office Hours lab verification",
  };
  const baseSession = base.session ?? {
    checkinAt: request.timestamp,
    lastPresenceAt: request.timestamp,
    requiresPresence: true,
  };

  return {
    ...base,
    ...request,
    userId: request.userId ?? base.userId,
    lat: request.lat ?? base.lat,
    lon: request.lon ?? base.lon,
    shift: {
      ...baseShift,
      ...request.shift,
      userId: request.shift?.userId ?? request.userId ?? baseShift.userId,
      officeLocationId: request.shift?.officeLocationId ?? baseShift.officeLocationId,
    },
    adminClose: {
      ...baseAdminClose,
      ...request.adminClose,
    },
    session: {
      ...baseSession,
      ...request.session,
    },
  } satisfies OfficeHoursLabRequest;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

export function OfficeHoursTestingLab({
  initialOfficeConfig,
  initialOfficeLocation,
  initialUsers,
  initialKioskMembers,
}: {
  initialOfficeConfig: OfficeConfigRow | null;
  initialOfficeLocation: OfficeLocationRow | null;
  initialUsers: UserRow[];
  initialKioskMembers: KioskLabMember[];
}) {
  const activeUsers = useMemo(
    () => initialUsers.filter((user) => user.status === "active"),
    [initialUsers],
  );
  const defaultUserId = activeUsers[0]?.id ?? null;
  const defaultKioskUserId = initialKioskMembers[0]?.user_id ?? defaultUserId;
  const presets = useMemo(
    () =>
      getOfficeHoursLabPresets({
        officeConfig: initialOfficeConfig,
        officeLocation: initialOfficeLocation,
      }),
    [initialOfficeConfig, initialOfficeLocation],
  );

  const initialRequest = useMemo(
    () =>
      hydrateRequestWithDefaults({
        request: presets[0]?.request ?? buildDefaultRequest({
          kind: "allowed_day",
          timestamp: new Date().toISOString(),
          defaultUserId,
          defaultKioskUserId,
          officeLocation: initialOfficeLocation,
        }),
        defaultUserId,
        defaultKioskUserId,
        officeLocation: initialOfficeLocation,
      }),
    [defaultKioskUserId, defaultUserId, initialOfficeLocation, presets],
  );

  const [mode, setMode] = useState<"simulate" | "live">("simulate");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(presets[0]?.id ?? "");
  const [request, setRequest] = useState<OfficeHoursLabRequest>(initialRequest);
  const [result, setResult] = useState<OfficeHoursLabResult | null>(null);
  const [suiteResults, setSuiteResults] = useState<SuiteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [suiteLoading, setSuiteLoading] = useState(false);
  const [error, setError] = useState("");

  function updateRequest(updater: (current: OfficeHoursLabRequest) => OfficeHoursLabRequest) {
    setRequest((current) =>
      hydrateRequestWithDefaults({
        request: updater(current),
        defaultUserId,
        defaultKioskUserId,
        officeLocation: initialOfficeLocation,
      }),
    );
  }

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  const activeUserOptions = activeUsers.map((user) => ({
    id: user.id,
    label: user.display_name?.trim() || user.email || "Unnamed member",
    meta: user.email ?? "No email",
  }));
  const kioskUserOptions = initialKioskMembers.map((member) => ({
    id: member.user_id,
    label: member.display_name,
    meta: `${member.role_label}${member.phone_last4 ? ` • ••••${member.phone_last4}` : ""}`,
  }));

  const needsUser =
    request.kind === "member_check_in" ||
    request.kind === "kiosk_status" ||
    request.kind === "kiosk_check_in" ||
    request.kind === "presence_ping" ||
    request.kind === "presence_heartbeat" ||
    request.kind === "shift_creation" ||
    request.kind === "admin_close_session";
  const usesKioskUsers = request.kind === "kiosk_status" || request.kind === "kiosk_check_in";
  const needsCoordinates =
    request.kind === "geofence" ||
    request.kind === "member_check_in" ||
    request.kind === "kiosk_check_in" ||
    request.kind === "presence_heartbeat";
  const liveAllowed = supportsLive(request.kind);

  async function runScenario(nextMode = mode, nextRequest = request) {
    setLoading(true);
    setError("");
    try {
      const endpoint = nextMode === "simulate" ? "/api/admin/office-hours/lab/simulate" : "/api/admin/office-hours/lab/live";
      const payload = hydrateRequestWithDefaults({
        request: nextRequest,
        defaultUserId,
        defaultKioskUserId,
        officeLocation: initialOfficeLocation,
      });
      const data = await postJson<{ ok: true; result: OfficeHoursLabResult }>(endpoint, payload);
      setResult(data.result);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not run the Office Hours lab.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function runSuite() {
    setSuiteLoading(true);
    setError("");
    setSuiteResults(presets.map((preset) => ({ presetId: preset.id, label: preset.label, verdict: "pending", headline: "Queued" })));

    const nextResults: SuiteEntry[] = [];
    for (const preset of presets) {
      try {
        const payload = hydrateRequestWithDefaults({
          request: preset.request,
          defaultUserId,
          defaultKioskUserId,
          officeLocation: initialOfficeLocation,
        });
        const data = await postJson<{ ok: true; result: OfficeHoursLabResult }>("/api/admin/office-hours/lab/simulate", payload);
        nextResults.push({
          presetId: preset.id,
          label: preset.label,
          verdict: data.result.verdict,
          headline: data.result.headline,
        });
      } catch (nextError) {
        nextResults.push({
          presetId: preset.id,
          label: preset.label,
          verdict: "fail",
          headline: nextError instanceof Error ? nextError.message : "Scenario failed",
        });
      }
      setSuiteResults([...nextResults]);
    }

    setSuiteLoading(false);
  }

  const policyOverrideWeekdays = request.policyOverride?.office_hours_allowed_weekdays ?? [];
  const policyOverrideDates = (request.policyOverride?.office_hours_extra_allowed_dates ?? []).join("\n");

  return (
    <div className="space-y-6">
      {error ? <AdminInlineNotice tone="warning">{error}</AdminInlineNotice> : null}

      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.7rem] border border-black/6 bg-[color:var(--admin-surface-raised)] p-5 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.18)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/45">Testing Lab</div>
              <h2 className="text-[1.45rem] font-semibold tracking-[-0.04em] text-foreground">
                Simulate the rules first, then verify live with cleanup.
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-foreground/66">
                This lab reuses the real Office Hours policy, geofence, kiosk, presence, shift, and admin-close logic. Simulation is safe by default. Live verification is explicit and cleanup-aware.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-black/8 bg-white px-3 py-2 text-xs font-medium text-foreground/70">
                {initialOfficeLocation?.name ?? "Office"} · {initialOfficeLocation?.timezone ?? "America/Los_Angeles"}
              </div>
              <div className="rounded-full border border-black/8 bg-white px-3 py-2 text-xs font-medium text-foreground/70">
                Radius {initialOfficeLocation?.radius_m ?? "?"}m · Grace {initialOfficeLocation?.grace_radius_m ?? "?"}m
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                mode === "simulate"
                  ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                  : "border-black/8 bg-white text-foreground/70",
              )}
              onClick={() => setMode("simulate")}
            >
              Simulate
            </button>
            <button
              type="button"
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition",
                mode === "live"
                  ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                  : "border-black/8 bg-white text-foreground/70",
              )}
              onClick={() => setMode("live")}
            >
              Live verify
            </button>
          </div>
        </div>

        <div className="rounded-[1.7rem] border border-black/6 bg-[color:var(--admin-surface-raised)] p-5 shadow-[0_20px_40px_-30px_rgba(15,23,42,0.18)]">
          <div className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-foreground/45">Preset Suite</div>
          <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">Quick regression sweep</div>
          <p className="mt-2 text-sm leading-6 text-foreground/64">
            Run the curated preset matrix against the current office config. The suite stays in simulation so it can cover edge cases without mutating data.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void runSuite()} disabled={suiteLoading} className="h-11 rounded-full px-5">
              {suiteLoading ? "Running suite…" : "Run preset suite"}
            </Button>
            <Link
              href="/admin/office-hours/config"
              className="inline-flex h-11 items-center justify-center rounded-full border border-black/8 bg-white px-5 text-sm font-medium text-foreground/78"
            >
              Back to Config
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <AdminSurface
          title="Scenario composer"
          description="Start from a preset, then override just enough to answer the question you care about."
        >
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <AdminField label="Preset" hint="Optional shortcut">
                <select
                  value={selectedPresetId}
                  onChange={(event) => {
                    const preset = presets.find((entry) => entry.id === event.target.value);
                    if (!preset) return;
                    startTransition(() => {
                      setSelectedPresetId(preset.id);
                      setRequest(
                        hydrateRequestWithDefaults({
                          request: preset.request,
                          defaultUserId,
                          defaultKioskUserId,
                          officeLocation: initialOfficeLocation,
                        }),
                      );
                    });
                  }}
                >
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </AdminField>

              <AdminField label="Scenario">
                <select
                  value={request.kind}
                  onChange={(event) =>
                    updateRequest((current) => ({ ...current, kind: event.target.value as OfficeHoursLabRequest["kind"] }))
                  }
                >
                  {SCENARIO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </AdminField>
            </div>

            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={cn(
                    "rounded-[1.2rem] border px-4 py-3 text-left text-sm transition",
                    preset.id === selectedPresetId
                      ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)]"
                      : "border-black/8 bg-white hover:bg-[rgb(248_249_246)]",
                  )}
                  onClick={() => {
                    startTransition(() => {
                      setSelectedPresetId(preset.id);
                      setRequest(
                        hydrateRequestWithDefaults({
                          request: preset.request,
                          defaultUserId,
                          defaultKioskUserId,
                          officeLocation: initialOfficeLocation,
                        }),
                      );
                    });
                  }}
                >
                  <div className="font-medium text-foreground">{preset.label}</div>
                  <div className="mt-1 max-w-[18rem] text-xs leading-5 text-foreground/62">{preset.description}</div>
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <AdminField label="Timestamp" hint="Probe moment">
                <input
                  type="datetime-local"
                  value={toDatetimeLocalValue(request.timestamp)}
                  onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        timestamp: fromDatetimeLocalValue(event.target.value, current.timestamp),
                      }))
                  }
                />
              </AdminField>

              {needsUser ? (
                <AdminField label={usesKioskUsers ? "Kiosk member" : "Target member"}>
                  <select
                    value={request.userId ?? ""}
                    onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        userId: event.target.value || undefined,
                        shift: current.shift ? { ...current.shift, userId: event.target.value || undefined } : current.shift,
                      }))
                    }
                  >
                    {(usesKioskUsers ? kioskUserOptions : activeUserOptions).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label} · {option.meta}
                      </option>
                    ))}
                  </select>
                </AdminField>
              ) : null}
            </div>

            {needsCoordinates ? (
              <div className="grid gap-3 md:grid-cols-2">
                <AdminField label="Latitude">
                  <input
                    type="number"
                    value={request.lat ?? 0}
                    onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        lat: Number(event.target.value || 0),
                      }))
                    }
                  />
                </AdminField>
                <AdminField label="Longitude">
                  <input
                    type="number"
                    value={request.lon ?? 0}
                    onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        lon: Number(event.target.value || 0),
                      }))
                    }
                  />
                </AdminField>
              </div>
            ) : null}

            {(request.kind === "allowed_day" || request.kind === "shift_creation") && (
              <div className="space-y-3 rounded-[1.4rem] border border-black/6 bg-white p-4">
                <div className="text-sm font-semibold tracking-[-0.02em] text-foreground">Temporary policy overrides</div>
                <label className="flex items-center gap-3 text-sm text-foreground/72">
                  <input
                    type="checkbox"
                    checked={request.policyOverride?.office_hours_allow_weekends ?? false}
                    onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        policyOverride: {
                          ...current.policyOverride,
                          office_hours_allow_weekends: event.target.checked,
                        },
                      }))
                    }
                  />
                  Allow weekends for this scenario only
                </label>

                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map((option) => {
                    const checked = policyOverrideWeekdays.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                          checked
                            ? "border-[rgb(0_104_94_/_0.18)] bg-[rgb(230_248_244)] text-[rgb(0_104_94)]"
                            : "border-black/8 bg-white text-foreground/65",
                        )}
                        onClick={() =>
                          updateRequest((current) => {
                            const next = checked
                              ? policyOverrideWeekdays.filter((value) => value !== option.value)
                              : [...policyOverrideWeekdays, option.value].sort((a, b) => a - b);
                            return {
                              ...current,
                              policyOverride: {
                                ...current.policyOverride,
                                office_hours_allowed_weekdays: next,
                              },
                            };
                          })
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <AdminField label="Extra allowed dates" hint="One YYYY-MM-DD per line">
                  <textarea
                    rows={3}
                    value={policyOverrideDates}
                    onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        policyOverride: {
                          ...current.policyOverride,
                          office_hours_extra_allowed_dates: event.target.value
                            .split(/\r?\n/)
                            .map((value) => value.trim())
                            .filter(Boolean),
                        },
                      }))
                    }
                  />
                </AdminField>
              </div>
            )}

            {request.kind === "member_flow" && (
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-3 rounded-[1.2rem] border border-black/6 bg-white px-4 py-3 text-sm text-foreground/72">
                  <input
                    type="checkbox"
                    checked={request.hasPhoto ?? false}
                    onChange={(event) => updateRequest((current) => ({ ...current, hasPhoto: event.target.checked }))}
                  />
                  Selfie captured
                </label>
                <label className="flex items-center gap-3 rounded-[1.2rem] border border-black/6 bg-white px-4 py-3 text-sm text-foreground/72">
                  <input
                    type="checkbox"
                    checked={request.preflightReady ?? false}
                    onChange={(event) => updateRequest((current) => ({ ...current, preflightReady: event.target.checked }))}
                  />
                  Location ready
                </label>
                <label className="flex items-center gap-3 rounded-[1.2rem] border border-black/6 bg-white px-4 py-3 text-sm text-foreground/72">
                  <input
                    type="checkbox"
                    checked={request.preflightAllowed ?? false}
                    onChange={(event) => updateRequest((current) => ({ ...current, preflightAllowed: event.target.checked }))}
                  />
                  Location allowed
                </label>
              </div>
            )}

            {(request.kind === "kiosk_status" || request.kind === "member_check_in" || request.kind === "kiosk_check_in") && (
              <div className="grid gap-3 md:grid-cols-2">
                {request.kind === "kiosk_status" ? (
                  <label className="flex items-center gap-3 rounded-[1.2rem] border border-black/6 bg-white px-4 py-3 text-sm text-foreground/72">
                    <input
                      type="checkbox"
                      checked={request.hasOpenSession ?? false}
                      onChange={(event) => updateRequest((current) => ({ ...current, hasOpenSession: event.target.checked }))}
                    />
                    Seed open session in simulation
                  </label>
                ) : null}

                {request.kind === "kiosk_status" || request.kind === "kiosk_check_in" ? (
                  <label className="flex items-center gap-3 rounded-[1.2rem] border border-black/6 bg-white px-4 py-3 text-sm text-foreground/72">
                    <input
                      type="checkbox"
                      checked={request.phoneMatched ?? true}
                      onChange={(event) => updateRequest((current) => ({ ...current, phoneMatched: event.target.checked }))}
                    />
                    Phone allowlisted
                  </label>
                ) : null}
              </div>
            )}

            {(request.kind === "presence_ping" || request.kind === "presence_heartbeat" || request.kind === "admin_close_session") && (
              <div className="grid gap-3 md:grid-cols-2">
                <AdminField label="Session check-in">
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(request.session?.checkinAt)}
                    onChange={(event) =>
                        updateRequest((current) => ({
                          ...current,
                          session: {
                            ...current.session,
                            checkinAt: fromDatetimeLocalValue(event.target.value, current.session?.checkinAt ?? current.timestamp),
                            lastPresenceAt: current.session?.lastPresenceAt ?? current.timestamp,
                            requiresPresence: current.session?.requiresPresence ?? true,
                          },
                        }))
                    }
                  />
                </AdminField>

                {request.kind === "presence_ping" || request.kind === "presence_heartbeat" ? (
                  <AdminField label="Last presence">
                    <input
                      type="datetime-local"
                      value={toDatetimeLocalValue(request.session?.lastPresenceAt)}
                      onChange={(event) =>
                        updateRequest((current) => ({
                          ...current,
                          session: {
                            ...current.session,
                            checkinAt: current.session?.checkinAt ?? current.timestamp,
                            lastPresenceAt: fromDatetimeLocalValue(event.target.value, current.session?.lastPresenceAt ?? current.timestamp),
                            requiresPresence: current.session?.requiresPresence ?? true,
                          },
                        }))
                      }
                    />
                  </AdminField>
                ) : (
                  <AdminField label="Checkout time">
                    <input
                      type="datetime-local"
                      value={toDatetimeLocalValue(request.adminClose?.checkoutAt)}
                      onChange={(event) =>
                        updateRequest((current) => ({
                          ...current,
                          adminClose: {
                            ...current.adminClose,
                            checkoutAt: fromDatetimeLocalValue(event.target.value, current.adminClose?.checkoutAt ?? current.timestamp),
                            excludeFromTotals: current.adminClose?.excludeFromTotals ?? false,
                            reason: current.adminClose?.reason ?? "Office Hours lab verification",
                          },
                        }))
                      }
                    />
                  </AdminField>
                )}

                {request.kind === "presence_ping" || request.kind === "presence_heartbeat" ? (
                  <label className="flex items-center gap-3 rounded-[1.2rem] border border-black/6 bg-white px-4 py-3 text-sm text-foreground/72">
                    <input
                      type="checkbox"
                      checked={request.session?.requiresPresence ?? true}
                      onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        session: {
                          ...current.session,
                          checkinAt: current.session?.checkinAt ?? current.timestamp,
                          lastPresenceAt: current.session?.lastPresenceAt ?? current.timestamp,
                          requiresPresence: event.target.checked,
                        },
                        }))
                      }
                    />
                    Requires presence enforcement
                  </label>
                ) : (
                  <label className="flex items-center gap-3 rounded-[1.2rem] border border-black/6 bg-white px-4 py-3 text-sm text-foreground/72">
                    <input
                      type="checkbox"
                      checked={request.adminClose?.excludeFromTotals ?? false}
                      onChange={(event) =>
                        updateRequest((current) => ({
                          ...current,
                          adminClose: {
                            ...current.adminClose,
                            checkoutAt: current.adminClose?.checkoutAt ?? current.timestamp,
                            excludeFromTotals: event.target.checked,
                            reason: current.adminClose?.reason ?? "Office Hours lab verification",
                          },
                        }))
                      }
                    />
                    Exclude from totals
                  </label>
                )}
              </div>
            )}

            {request.kind === "shift_creation" && (
              <div className="grid gap-3 md:grid-cols-2">
                <AdminField label="Shift starts">
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(request.shift?.startsAt)}
                    onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        shift: {
                          ...current.shift,
                          userId: current.shift?.userId ?? current.userId,
                          startsAt: fromDatetimeLocalValue(event.target.value, current.shift?.startsAt ?? current.timestamp),
                          endsAt: current.shift?.endsAt ?? current.timestamp,
                          officeLocationId: current.shift?.officeLocationId ?? initialOfficeLocation?.id,
                        },
                      }))
                    }
                  />
                </AdminField>
                <AdminField label="Shift ends">
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(request.shift?.endsAt)}
                    onChange={(event) =>
                      updateRequest((current) => ({
                        ...current,
                        shift: {
                          ...current.shift,
                          userId: current.shift?.userId ?? current.userId,
                          startsAt: current.shift?.startsAt ?? current.timestamp,
                          endsAt: fromDatetimeLocalValue(event.target.value, current.shift?.endsAt ?? current.timestamp),
                          officeLocationId: current.shift?.officeLocationId ?? initialOfficeLocation?.id,
                        },
                      }))
                    }
                  />
                </AdminField>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void runScenario()}
                disabled={loading || (mode === "live" && !liveAllowed)}
                className="h-11 rounded-full px-5"
              >
                {loading ? "Running…" : mode === "simulate" ? "Run simulation" : "Run live verify"}
              </Button>
              {mode === "live" && !liveAllowed ? (
                <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                  This scenario is simulate-only in v1.
                </div>
              ) : null}
              {selectedPreset ? (
                <div className="text-sm text-foreground/58">
                  Preset: <span className="font-medium text-foreground">{selectedPreset.label}</span>
                </div>
              ) : null}
            </div>
          </div>
        </AdminSurface>

        <div className="space-y-4">
          <AdminSurface
            title="Verdict"
            description="The lab returns the exact verdict, codes, evidence, and cleanup state the UI should make obvious."
          >
            {result ? (
              <div className="space-y-4">
                <div className="rounded-[1.45rem] border border-black/6 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={cn("rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]", verdictClassName(result.verdict))}>
                      {result.verdict}
                    </div>
                    <div className="rounded-full border border-black/8 bg-[rgb(248_249_246)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/60">
                      {scenarioLabel(result.kind)}
                    </div>
                    {result.resultCode ? (
                      <div className="rounded-full border border-black/8 bg-[rgb(248_249_246)] px-3 py-1 text-xs font-medium text-foreground/70">
                        {result.resultCode}
                      </div>
                    ) : null}
                    {result.errorCode ? (
                      <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                        {result.errorCode}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 text-[1.2rem] font-semibold tracking-[-0.03em] text-foreground">{result.headline}</div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[1.35rem] border border-black/6 bg-white p-4">
                    <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Trace</div>
                    <div className="mt-3 space-y-2">
                      {result.trace.map((entry) => (
                        <div key={`${entry.label}-${entry.value}`} className="flex items-start justify-between gap-4 text-sm">
                          <div className="text-foreground/56">{entry.label}</div>
                          <div className="text-right font-medium text-foreground">{entry.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.35rem] border border-black/6 bg-white p-4">
                    <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Evidence</div>
                    <div className="mt-3 space-y-2">
                      {result.evidence.length > 0 ? (
                        result.evidence.map((entry) => (
                          <div key={`${entry.label}-${entry.value}`} className="flex items-start justify-between gap-4 text-sm">
                            <div className="text-foreground/56">{entry.label}</div>
                            <div className="text-right font-medium text-foreground">{entry.value}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-foreground/56">No extra evidence was needed for this result.</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={cn("rounded-[1.35rem] border p-4", result.cleanup.ok ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50/70")}>
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground/48">Cleanup</div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {result.cleanup.attempted
                      ? result.cleanup.ok
                        ? "Temporary artifacts were cleaned up."
                        : "Cleanup needs attention."
                      : "No cleanup was required."}
                  </div>
                  {result.cleanup.message ? <div className="mt-1 text-sm text-foreground/70">{result.cleanup.message}</div> : null}
                </div>
              </div>
            ) : (
              <div className="rounded-[1.45rem] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] px-4 py-6 text-sm text-foreground/58">
                Run a scenario to inspect the verdict, trace, evidence, and cleanup state.
              </div>
            )}
          </AdminSurface>

          <AdminSurface
            title="Suite Matrix"
            description="A compact readout of the preset regression sweep."
          >
            {suiteResults.length > 0 ? (
              <div className="grid gap-2">
                {suiteResults.map((entry) => (
                  <div key={entry.presetId} className="flex items-center gap-3 rounded-[1.15rem] border border-black/6 bg-white px-4 py-3">
                    <div className={cn("rounded-full border px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.14em]", verdictClassName(entry.verdict))}>
                      {entry.verdict}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{entry.label}</div>
                      <div className="truncate text-xs text-foreground/58">{entry.headline}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.45rem] border border-dashed border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] px-4 py-6 text-sm text-foreground/58">
                The suite fills in here after you run the preset matrix.
              </div>
            )}
          </AdminSurface>
        </div>
      </div>
    </div>
  );
}

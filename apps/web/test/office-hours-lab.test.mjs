import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyOfficeHoursLabGeofence,
  evaluateOfficeHoursDayPolicy,
  getOfficeHoursLabPresets,
  simulateOfficeHoursLab,
} from "../src/lib/office-hours-lab.ts";

function buildContext(overrides = {}) {
  return {
    officeConfig: {
      quiet_hours_enabled: false,
      quiet_hours_start_local: "18:00:00",
      quiet_hours_end_local: "07:00:00",
      weekly_hours_reminder_enabled: false,
      weekly_hours_reminder_weekday: 5,
      weekly_hours_reminder_time_local: "12:00:00",
      office_hours_allow_weekends: false,
      office_hours_allowed_weekdays: [1, 2, 3, 4, 5],
      office_hours_extra_allowed_dates: [],
      ...overrides.officeConfig,
    },
    officeLocation: {
      name: "Main Office",
      timezone: "America/Los_Angeles",
      lat: 32.7157,
      lon: -117.1611,
      radius_m: 45,
      grace_radius_m: 70,
      ...overrides.officeLocation,
    },
  };
}

test("evaluateOfficeHoursDayPolicy allows extra enabled dates even when the weekday is otherwise blocked", () => {
  const result = evaluateOfficeHoursDayPolicy({
    timestamp: "2026-03-29T10:00:00-07:00",
    officeConfig: {
      office_hours_allow_weekends: false,
      office_hours_allowed_weekdays: [1, 2, 3, 4, 5],
      office_hours_extra_allowed_dates: ["2026-03-29"],
    },
    officeLocation: { timezone: "America/Los_Angeles" },
  });

  assert.equal(result.allowed, true);
  assert.equal(result.allowedByExtraDate, true);
  assert.equal(result.allowedByWeekday, false);
  assert.equal(result.localDate, "2026-03-29");
  assert.equal(result.isoWeekday, 7);
});

test("classifyOfficeHoursLabGeofence distinguishes radius, grace zone, and out-of-range bands", () => {
  assert.deepEqual(
    classifyOfficeHoursLabGeofence({ distanceM: 20, radiusM: 45, graceRadiusM: 70 }),
    { band: "in_radius", verdict: "pass", statusTone: "good", statusLabel: "In range" },
  );

  assert.deepEqual(
    classifyOfficeHoursLabGeofence({ distanceM: 56, radiusM: 45, graceRadiusM: 70 }),
    { band: "in_grace", verdict: "warning", statusTone: "warning", statusLabel: "Grace zone" },
  );

  assert.deepEqual(
    classifyOfficeHoursLabGeofence({ distanceM: 87, radiusM: 45, graceRadiusM: 70 }),
    { band: "outside_grace", verdict: "fail", statusTone: "critical", statusLabel: "Out of range" },
  );
});

test("simulateOfficeHoursLab surfaces the member flow gating step before check-in", () => {
  const result = simulateOfficeHoursLab({
    context: buildContext(),
    request: {
      kind: "member_flow",
      timestamp: "2026-03-30T10:00:00-07:00",
      hasPhoto: true,
      preflightReady: false,
      preflightAllowed: false,
    },
  });

  assert.equal(result.verdict, "warning");
  assert.equal(result.resultCode, "member_flow_location");
  assert.equal(result.errorCode, null);
  assert.equal(result.headline, "Member flow is waiting on location");
  assert.deepEqual(
    result.trace.map((entry) => entry.label),
    ["Scenario", "Mode", "Timestamp", "Current step", "Next section"],
  );
});

test("simulateOfficeHoursLab flips kiosk status intent when an open session exists", () => {
  const result = simulateOfficeHoursLab({
    context: buildContext(),
    request: {
      kind: "kiosk_status",
      timestamp: "2026-03-30T10:00:00-07:00",
      phoneMatched: true,
      hasOpenSession: true,
    },
  });

  assert.equal(result.verdict, "pass");
  assert.equal(result.resultCode, "kiosk_status_check_out");
  assert.equal(result.errorCode, null);
  assert.equal(result.headline, "Kiosk status resolves to check out");
});

test("simulateOfficeHoursLab respects temporary policy overrides on the request", () => {
  const result = simulateOfficeHoursLab({
    context: buildContext(),
    request: {
      kind: "allowed_day",
      timestamp: "2026-03-29T10:00:00-07:00",
      policyOverride: {
        office_hours_extra_allowed_dates: ["2026-03-29"],
      },
    },
  });

  assert.equal(result.verdict, "pass");
  assert.equal(result.resultCode, "day_allowed");
  assert.equal(result.errorCode, null);
});

test("simulateOfficeHoursLab applies the after-5pm 15-minute presence timeout policy", () => {
  const staleAfterHours = simulateOfficeHoursLab({
    context: buildContext(),
    request: {
      kind: "presence_ping",
      timestamp: "2026-03-30T17:20:00-07:00",
      session: {
        checkinAt: "2026-03-30T15:30:00-07:00",
        lastPresenceAt: "2026-03-30T17:00:00-07:00",
        requiresPresence: true,
      },
    },
  });

  assert.equal(staleAfterHours.verdict, "fail");
  assert.equal(staleAfterHours.resultCode, "presence_checked_out");
  assert.equal(staleAfterHours.errorCode, "presence_timeout_after_5pm");
  assert.equal(staleAfterHours.headline, "Presence policy would auto-close this session");

  const daytimeSession = simulateOfficeHoursLab({
    context: buildContext(),
    request: {
      kind: "presence_ping",
      timestamp: "2026-03-30T16:30:00-07:00",
      session: {
        checkinAt: "2026-03-30T15:30:00-07:00",
        lastPresenceAt: "2026-03-30T16:00:00-07:00",
        requiresPresence: true,
      },
    },
  });

  assert.equal(daytimeSession.verdict, "pass");
  assert.equal(daytimeSession.resultCode, "presence_ok");
  assert.equal(daytimeSession.errorCode, null);
});

test("getOfficeHoursLabPresets returns stable preset coverage for the suite matrix", () => {
  const presets = getOfficeHoursLabPresets(buildContext());
  const ids = presets.map((preset) => preset.id);

  assert.deepEqual(ids, [
    "blocked-weekend",
    "extra-date-weekend",
    "in-grace-zone",
    "outside-geofence",
    "member-location-gate",
    "kiosk-open-session",
    "presence-timeout-after-hours",
    "shift-blocked-day",
    "admin-close-invalid-time",
  ]);
});

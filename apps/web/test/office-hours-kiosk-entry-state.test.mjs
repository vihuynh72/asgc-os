import test from "node:test";
import assert from "node:assert/strict";

import {
  canSubmitKioskCheckIn,
  deriveKioskEntryStep,
  mapDistanceToPreflightStatus,
} from "../src/lib/office-hours-kiosk/entry-state.mjs";

test("deriveKioskEntryStep resolves check-in flow in strict order", () => {
  assert.equal(
    deriveKioskEntryStep({
      emailValid: false,
      hasPhoto: false,
      hasOpenSession: false,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "email",
  );

  assert.equal(
    deriveKioskEntryStep({
      emailValid: true,
      hasPhoto: false,
      hasOpenSession: false,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "selfie",
  );

  assert.equal(
    deriveKioskEntryStep({
      emailValid: true,
      hasPhoto: true,
      hasOpenSession: false,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "location",
  );

  assert.equal(
    deriveKioskEntryStep({
      emailValid: true,
      hasPhoto: true,
      hasOpenSession: false,
      preflightReady: true,
      preflightAllowed: true,
    }),
    "action",
  );

  assert.equal(
    deriveKioskEntryStep({
      emailValid: true,
      hasPhoto: false,
      hasOpenSession: true,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "checked_in",
  );
});

test("canSubmitKioskCheckIn requires email, selfie, and allowed preflight", () => {
  assert.equal(
    canSubmitKioskCheckIn({
      emailValid: true,
      hasPhoto: true,
      preflightReady: true,
      preflightAllowed: true,
    }),
    true,
  );

  assert.equal(
    canSubmitKioskCheckIn({
      emailValid: false,
      hasPhoto: true,
      preflightReady: true,
      preflightAllowed: true,
    }),
    false,
  );

  assert.equal(
    canSubmitKioskCheckIn({
      emailValid: true,
      hasPhoto: false,
      preflightReady: true,
      preflightAllowed: true,
    }),
    false,
  );

  assert.equal(
    canSubmitKioskCheckIn({
      emailValid: true,
      hasPhoto: true,
      preflightReady: false,
      preflightAllowed: true,
    }),
    false,
  );

  assert.equal(
    canSubmitKioskCheckIn({
      emailValid: true,
      hasPhoto: true,
      preflightReady: true,
      preflightAllowed: false,
    }),
    false,
  );
});

test("mapDistanceToPreflightStatus maps geofence bands and tones", () => {
  assert.deepEqual(
    mapDistanceToPreflightStatus({ distanceM: 38, radiusM: 45, graceRadiusM: 70 }),
    { band: "in_radius", statusTone: "good", statusLabel: "In range" },
  );

  assert.deepEqual(
    mapDistanceToPreflightStatus({ distanceM: 59, radiusM: 45, graceRadiusM: 70 }),
    { band: "in_grace", statusTone: "warning", statusLabel: "Grace zone" },
  );

  assert.deepEqual(
    mapDistanceToPreflightStatus({ distanceM: 89, radiusM: 45, graceRadiusM: 70 }),
    { band: "outside_grace", statusTone: "critical", statusLabel: "Out of range" },
  );
});

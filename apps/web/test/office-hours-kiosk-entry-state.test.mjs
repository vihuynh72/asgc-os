import test from "node:test";
import assert from "node:assert/strict";

import {
  canSubmitKioskCheckIn,
  deriveKioskCheckInStep,
  deriveKioskEntryBranch,
  mapDistanceToPreflightStatus,
} from "../src/lib/office-hours-kiosk/entry-state.mjs";

test("deriveKioskEntryBranch keeps invalid or unresolved email in the email branch", () => {
  assert.equal(
    deriveKioskEntryBranch({
      emailValid: false,
      statusResolved: false,
      hasOpenSession: false,
    }),
    "email",
  );

  assert.equal(
    deriveKioskEntryBranch({
      emailValid: true,
      statusResolved: false,
      hasOpenSession: false,
    }),
    "email",
  );
});

test("deriveKioskEntryBranch sends resolved users into the correct branch", () => {
  assert.equal(
    deriveKioskEntryBranch({
      emailValid: true,
      statusResolved: true,
      hasOpenSession: false,
    }),
    "check_in",
  );

  assert.equal(
    deriveKioskEntryBranch({
      emailValid: true,
      statusResolved: true,
      hasOpenSession: true,
    }),
    "check_out",
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

test("deriveKioskCheckInStep progresses through selfie, location, and action", () => {
  assert.equal(
    deriveKioskCheckInStep({
      hasPhoto: false,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "selfie",
  );

  assert.equal(
    deriveKioskCheckInStep({
      hasPhoto: true,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "location",
  );

  assert.equal(
    deriveKioskCheckInStep({
      hasPhoto: true,
      preflightReady: true,
      preflightAllowed: true,
    }),
    "action",
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

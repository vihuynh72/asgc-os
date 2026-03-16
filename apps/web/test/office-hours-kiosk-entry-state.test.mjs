import test from "node:test";
import assert from "node:assert/strict";

import {
  canSubmitKioskCheckIn,
  canSubmitKioskCheckOut,
  deriveKioskIntentBranch,
  deriveKioskVerificationStep,
  mapDistanceToPreflightStatus,
} from "../src/lib/office-hours-kiosk/entry-state.mjs";

test("deriveKioskIntentBranch keeps unresolved status in the status branch", () => {
  assert.equal(
    deriveKioskIntentBranch({
      statusResolved: false,
      hasOpenSession: false,
    }),
    "status",
  );
});

test("deriveKioskIntentBranch sends resolved users into the correct intent branch", () => {
  assert.equal(
    deriveKioskIntentBranch({
      statusResolved: true,
      hasOpenSession: false,
    }),
    "check_in",
  );

  assert.equal(
    deriveKioskIntentBranch({
      statusResolved: true,
      hasOpenSession: true,
    }),
    "check_out",
  );
});

test("canSubmitKioskCheckIn requires OTP verification and allowed location preflight", () => {
  assert.equal(
    canSubmitKioskCheckIn({
      otpVerified: true,
      preflightReady: true,
      preflightAllowed: true,
    }),
    true,
  );

  assert.equal(
    canSubmitKioskCheckIn({
      otpVerified: false,
      preflightReady: true,
      preflightAllowed: true,
    }),
    false,
  );

  assert.equal(
    canSubmitKioskCheckIn({
      otpVerified: true,
      preflightReady: false,
      preflightAllowed: true,
    }),
    false,
  );

  assert.equal(
    canSubmitKioskCheckIn({
      otpVerified: true,
      preflightReady: true,
      preflightAllowed: false,
    }),
    false,
  );
});

test("canSubmitKioskCheckOut requires only OTP verification", () => {
  assert.equal(
    canSubmitKioskCheckOut({
      otpVerified: true,
    }),
    true,
  );

  assert.equal(
    canSubmitKioskCheckOut({
      otpVerified: false,
    }),
    false,
  );
});

test("deriveKioskVerificationStep progresses through otp, location, and action", () => {
  assert.equal(
    deriveKioskVerificationStep({
      otpVerified: false,
      requiresLocation: true,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "otp",
  );

  assert.equal(
    deriveKioskVerificationStep({
      otpVerified: true,
      requiresLocation: true,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "location",
  );

  assert.equal(
    deriveKioskVerificationStep({
      otpVerified: true,
      requiresLocation: true,
      preflightReady: true,
      preflightAllowed: true,
    }),
    "action",
  );

  assert.equal(
    deriveKioskVerificationStep({
      otpVerified: true,
      requiresLocation: false,
      preflightReady: false,
      preflightAllowed: false,
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

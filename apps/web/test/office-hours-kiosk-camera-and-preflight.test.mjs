import test from "node:test";
import assert from "node:assert/strict";

import { shapeCameraControlState } from "../src/lib/office-hours-kiosk/camera-controls.mjs";
import { shapeLocationCheckResult } from "../src/lib/office-hours-kiosk/location-check.mjs";

test("shapeCameraControlState exposes progressive controls by capability", () => {
  assert.deepEqual(
    shapeCameraControlState({
      canEnumerateDevices: true,
      devices: [
        { deviceId: "front", kind: "videoinput", label: "Front Camera" },
        { deviceId: "back", kind: "videoinput", label: "Back Camera" },
      ],
      capabilities: { zoom: { min: 1, max: 5, step: 0.5 }, torch: true },
      currentFacingMode: "environment",
    }),
    {
      canFlip: true,
      canZoom: true,
      zoomRange: { min: 1, max: 5, step: 0.5 },
      canTorch: true,
      facingMode: "environment",
      cameraCount: 2,
    },
  );

  assert.deepEqual(
    shapeCameraControlState({
      canEnumerateDevices: false,
      devices: [],
      capabilities: {},
      currentFacingMode: "user",
    }),
    {
      canFlip: false,
      canZoom: false,
      zoomRange: null,
      canTorch: false,
      facingMode: "user",
      cameraCount: 0,
    },
  );
});

test("shapeLocationCheckResult orders allowlist/day/geofence decisions correctly", () => {
  assert.deepEqual(
    shapeLocationCheckResult({
      decision: { allowed: false, reason: "email_not_allowed" },
      dayAllowed: true,
      distanceM: 12,
      radiusM: 45,
      graceRadiusM: 70,
    }),
    {
      ok: false,
      decision: { allowed: false, reason: "email_not_allowed" },
      dayAllowed: true,
      distanceM: 12,
      radiusM: 45,
      graceRadiusM: 70,
      band: "in_radius",
      statusTone: "critical",
      statusLabel: "Access required",
    },
  );

  assert.deepEqual(
    shapeLocationCheckResult({
      decision: { allowed: true },
      dayAllowed: false,
      distanceM: 12,
      radiusM: 45,
      graceRadiusM: 70,
    }),
    {
      ok: false,
      decision: { allowed: true },
      dayAllowed: false,
      distanceM: 12,
      radiusM: 45,
      graceRadiusM: 70,
      band: "in_radius",
      statusTone: "warning",
      statusLabel: "Day unavailable",
    },
  );

  assert.deepEqual(
    shapeLocationCheckResult({
      decision: { allowed: true },
      dayAllowed: true,
      distanceM: 56,
      radiusM: 45,
      graceRadiusM: 70,
    }),
    {
      ok: true,
      decision: { allowed: true },
      dayAllowed: true,
      distanceM: 56,
      radiusM: 45,
      graceRadiusM: 70,
      band: "in_grace",
      statusTone: "warning",
      statusLabel: "Grace zone",
    },
  );

  assert.deepEqual(
    shapeLocationCheckResult({
      decision: { allowed: true },
      dayAllowed: true,
      distanceM: 87,
      radiusM: 45,
      graceRadiusM: 70,
    }),
    {
      ok: false,
      decision: { allowed: true },
      dayAllowed: true,
      distanceM: 87,
      radiusM: 45,
      graceRadiusM: 70,
      band: "outside_grace",
      statusTone: "critical",
      statusLabel: "Out of range",
    },
  );
});

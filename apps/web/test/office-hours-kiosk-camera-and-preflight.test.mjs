import test from "node:test";
import assert from "node:assert/strict";

import {
  clampCameraZoomValue,
  deriveDragZoomLevel,
  pickNextCameraTarget,
  resolveKioskCameraSurface,
  shapeCameraControlState,
  shouldMirrorUserFacingCamera,
} from "../src/lib/office-hours-kiosk/camera-controls.mjs";
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

test("pickNextCameraTarget prefers the opposite facing camera over the next raw device", () => {
  assert.deepEqual(
    pickNextCameraTarget({
      devices: [
        { deviceId: "front", kind: "videoinput", label: "Front Camera" },
        { deviceId: "back-wide", kind: "videoinput", label: "Back Wide Camera" },
        { deviceId: "back-ultra", kind: "videoinput", label: "Back Ultra Wide Camera" },
      ],
      selectedDeviceId: "back-wide",
      facingMode: "environment",
    }),
    {
      deviceId: "front",
      facingMode: "user",
    },
  );

  assert.deepEqual(
    pickNextCameraTarget({
      devices: [
        { deviceId: "cam-a", kind: "videoinput", label: "" },
        { deviceId: "cam-b", kind: "videoinput", label: "" },
      ],
      selectedDeviceId: "cam-a",
      facingMode: "user",
    }),
    {
      deviceId: "cam-b",
      facingMode: "environment",
    },
  );
});

test("resolveKioskCameraSurface is camera-only and never routes to file upload", () => {
  assert.equal(
    resolveKioskCameraSurface({ hasValue: true, canUseCamera: true, cameraState: "ready" }),
    "preview",
  );

  assert.equal(
    resolveKioskCameraSurface({ hasValue: false, canUseCamera: true, cameraState: "ready" }),
    "live",
  );

  assert.equal(
    resolveKioskCameraSurface({ hasValue: false, canUseCamera: true, cameraState: "idle" }),
    "prompt",
  );

  assert.equal(
    resolveKioskCameraSurface({ hasValue: false, canUseCamera: false, cameraState: "idle" }),
    "unavailable",
  );
});

test("camera zoom helpers clamp values and translate mobile drag into zoom changes", () => {
  assert.equal(clampCameraZoomValue(8, { min: 1, max: 5, step: 0.5 }), 5);
  assert.equal(clampCameraZoomValue(0.5, { min: 1, max: 5, step: 0.5 }), 1);
  assert.equal(clampCameraZoomValue(Number.NaN, { min: 1, max: 5, step: 0.5 }), 1);

  assert.equal(
    deriveDragZoomLevel({
      startZoom: 2,
      zoomRange: { min: 1, max: 5, step: 0.5 },
      dragDeltaY: -200,
      surfaceHeight: 400,
    }),
    4,
  );

  assert.equal(
    deriveDragZoomLevel({
      startZoom: 4,
      zoomRange: { min: 1, max: 5, step: 0.5 },
      dragDeltaY: 800,
      surfaceHeight: 400,
    }),
    1,
  );
});

test("user-facing cameras mirror both the preview and captured selfie", () => {
  assert.equal(shouldMirrorUserFacingCamera("user"), true);
  assert.equal(shouldMirrorUserFacingCamera("environment"), false);
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

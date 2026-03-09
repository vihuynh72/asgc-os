function normalizeZoomRange(rawZoom) {
  if (!rawZoom || typeof rawZoom !== "object") return null;

  const min = Number(rawZoom.min);
  const max = Number(rawZoom.max);
  const step = Number(rawZoom.step);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const safeStep = Number.isFinite(step) && step > 0 ? step : 0.1;
  return { min, max, step: safeStep };
}

function hasTorchCapability(capabilities) {
  return Boolean(capabilities && typeof capabilities === "object" && capabilities.torch === true);
}

export function inferCameraFacing(device) {
  if (!device?.label) return null;
  const label = String(device.label).toLowerCase();
  if (label.includes("back") || label.includes("rear") || label.includes("environment")) return "environment";
  if (
    label.includes("front") ||
    label.includes("facetime") ||
    label.includes("selfie") ||
    label.includes("user")
  ) {
    return "user";
  }
  return null;
}

export function pickNextCameraTarget({
  devices,
  selectedDeviceId,
  facingMode,
}) {
  const videoInputs = Array.isArray(devices)
    ? devices.filter((device) => device && device.kind === "videoinput")
    : [];
  const toggledFacingMode = facingMode === "environment" ? "user" : "environment";

  const oppositeFacingDevice = videoInputs.find(
    (device) =>
      device.deviceId !== selectedDeviceId && inferCameraFacing(device) === toggledFacingMode,
  );
  if (oppositeFacingDevice?.deviceId) {
    return {
      deviceId: oppositeFacingDevice.deviceId,
      facingMode: toggledFacingMode,
    };
  }

  if (videoInputs.length > 1 && selectedDeviceId) {
    const currentIndex = videoInputs.findIndex((device) => device.deviceId === selectedDeviceId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % videoInputs.length : 0;
    const nextDevice = videoInputs[nextIndex];
    return {
      deviceId: nextDevice?.deviceId ?? null,
      facingMode: inferCameraFacing(nextDevice) ?? toggledFacingMode,
    };
  }

  return { deviceId: null, facingMode: toggledFacingMode };
}

export function shapeCameraControlState({
  canEnumerateDevices,
  devices,
  capabilities,
  currentFacingMode,
}) {
  const videoInputs = Array.isArray(devices)
    ? devices.filter((device) => device && device.kind === "videoinput")
    : [];
  const zoomRange = normalizeZoomRange(capabilities?.zoom);

  return {
    canFlip: Boolean(canEnumerateDevices && videoInputs.length > 1),
    canZoom: Boolean(zoomRange),
    zoomRange,
    canTorch: hasTorchCapability(capabilities),
    facingMode: currentFacingMode === "environment" ? "environment" : "user",
    cameraCount: videoInputs.length,
  };
}

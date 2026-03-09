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

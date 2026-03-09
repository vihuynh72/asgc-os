"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { shapeCameraControlState } from "@/lib/office-hours-kiosk/camera-controls.mjs";

type CaptureQuality = "balanced" | "high";
type FacingMode = "user" | "environment";
type CaptureMode = "camera" | "file";

function supportsCameraCapture(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

function qualityToCompression(quality: CaptureQuality): number {
  return quality === "high" ? 0.92 : 0.82;
}

function detectFacingMode(device: MediaDeviceInfo | undefined): FacingMode | null {
  if (!device?.label) return null;
  const label = device.label.toLowerCase();
  if (label.includes("back") || label.includes("rear") || label.includes("environment")) return "environment";
  if (label.includes("front") || label.includes("facetime") || label.includes("user")) return "user";
  return null;
}

function fileFromBlob(blob: Blob): File {
  const name = `kiosk-selfie-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`;
  return new File([blob], name, { type: "image/jpeg" });
}

async function imageBlobFromVideo(video: HTMLVideoElement, quality: CaptureQuality): Promise<Blob> {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  const maxDimension = 1440;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.drawImage(video, 0, 0, outputWidth, outputHeight);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", qualityToCompression(quality)));
  if (!blob) throw new Error("capture_failed");
  return blob;
}

export function useKioskCamera({
  disabled,
  onCapture,
}: {
  disabled: boolean;
  onCapture: (file: File) => void;
}) {
  const canUseCamera = supportsCameraCapture();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<CaptureMode>(() => (canUseCamera ? "camera" : "file"));
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "ready">("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [warmTooLong, setWarmTooLong] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("user");
  const [capabilities, setCapabilities] = useState<Record<string, unknown>>({});
  const [zoom, setZoom] = useState<number | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [quality, setQuality] = useState<CaptureQuality>("balanced");

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([]);
      return;
    }
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(allDevices.filter((device) => device.kind === "videoinput"));
    } catch {
      setDevices([]);
    }
  }, []);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCapabilities({});
    setZoom(null);
    setTorchOn(false);
    setVideoReady(false);
    setWarmTooLong(false);
    setCameraState("idle");
  }, []);

  const attachVideo = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => null);
  }, []);

  const start = useCallback(
    async (overrides?: { deviceId?: string | null; facingMode?: FacingMode }) => {
      if (!canUseCamera) {
        setCameraError("Camera unavailable");
        return;
      }
      stop();
      setCameraError(null);
      setCameraState("starting");
      setWarmTooLong(false);

      try {
        if (!window.isSecureContext) {
          throw new Error("insecure_context");
        }

        const nextDeviceId = overrides?.deviceId ?? selectedDeviceId;
        const nextFacingMode = overrides?.facingMode ?? facingMode;
        const constraints: MediaTrackConstraints = nextDeviceId
          ? { deviceId: { exact: nextDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : {
              facingMode: { ideal: nextFacingMode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const deviceId = track.getSettings().deviceId ?? nextDeviceId ?? null;
        if (deviceId) {
          setSelectedDeviceId(deviceId);
        }
        const inferredFacing = detectFacingMode(devices.find((device) => device.deviceId === deviceId)) ?? nextFacingMode;
        setFacingMode(inferredFacing);

        const trackCapabilities = typeof track.getCapabilities === "function" ? (track.getCapabilities() as Record<string, unknown>) : {};
        setCapabilities(trackCapabilities);

        const controlState = shapeCameraControlState({
          canEnumerateDevices: Boolean(navigator.mediaDevices?.enumerateDevices),
          devices,
          capabilities: trackCapabilities,
          currentFacingMode: inferredFacing,
        });
        if (controlState.zoomRange) {
          const trackZoom = Number((track.getSettings() as { zoom?: number }).zoom);
          const initialZoom = Number.isFinite(trackZoom)
            ? Math.max(controlState.zoomRange.min, Math.min(trackZoom, controlState.zoomRange.max))
            : controlState.zoomRange.min;
          setZoom(initialZoom);
        }

        setCameraState("ready");
        await refreshDevices();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "insecure_context") {
          setCameraError("Camera needs HTTPS");
        } else {
          setCameraError("Camera permission required");
        }
        stop();
        setMode("file");
      }
    },
    [canUseCamera, devices, facingMode, refreshDevices, selectedDeviceId, stop],
  );

  const rotateCamera = useCallback(async () => {
    if (devices.length > 1 && selectedDeviceId) {
      const currentIndex = devices.findIndex((device) => device.deviceId === selectedDeviceId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % devices.length : 0;
      const nextDevice = devices[nextIndex];
      setSelectedDeviceId(nextDevice.deviceId);
      setFacingMode(detectFacingMode(nextDevice) ?? (facingMode === "user" ? "environment" : "user"));
      await start({ deviceId: nextDevice.deviceId });
      return;
    }

    const toggledFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(toggledFacingMode);
    await start({ deviceId: null, facingMode: toggledFacingMode });
  }, [devices, facingMode, selectedDeviceId, start]);

  const setZoomLevel = useCallback(
    async (nextZoom: number) => {
      const stream = streamRef.current;
      const track = stream?.getVideoTracks()[0];
      if (!track || !Number.isFinite(nextZoom)) return;
      setZoom(nextZoom);
      try {
        await track.applyConstraints({ advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet] });
      } catch {
        // Ignore unsupported zoom changes.
      }
    },
    [],
  );

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const nextTorch = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: nextTorch } as MediaTrackConstraintSet] });
      setTorchOn(nextTorch);
    } catch {
      setCameraError("Torch unavailable");
    }
  }, [torchOn]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoReady) return;
    setCapturing(true);
    setCameraError(null);
    try {
      const blob = await imageBlobFromVideo(video, quality);
      onCapture(fileFromBlob(blob));
      stop();
    } catch {
      setCameraError("Capture failed");
    } finally {
      setCapturing(false);
    }
  }, [onCapture, quality, stop, videoReady]);

  useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  useEffect(() => {
    if (mode !== "camera" || cameraState !== "ready") return;
    attachVideo();
  }, [attachVideo, cameraState, mode]);

  useEffect(() => {
    if (mode !== "camera" || disabled) {
      stop();
    }
  }, [disabled, mode, stop]);

  useEffect(() => {
    if (cameraState !== "starting") return;
    const id = window.setTimeout(() => {
      setCameraError("Waiting for permission");
    }, 1800);
    return () => window.clearTimeout(id);
  }, [cameraState]);

  useEffect(() => {
    if (cameraState !== "ready" || videoReady) return;
    const id = window.setTimeout(() => setWarmTooLong(true), 2500);
    return () => window.clearTimeout(id);
  }, [cameraState, videoReady]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const controlState = useMemo(
    () =>
      shapeCameraControlState({
        canEnumerateDevices: typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.enumerateDevices),
        devices,
        capabilities,
        currentFacingMode: facingMode,
      }),
    [capabilities, devices, facingMode],
  );

  return {
    canUseCamera,
    videoRef,
    mode,
    setMode,
    cameraState,
    cameraError,
    videoReady,
    setVideoReady,
    warmTooLong,
    capturing,
    quality,
    setQuality,
    controlState,
    zoom,
    torchOn,
    start,
    stop,
    capture,
    rotateCamera,
    setZoomLevel,
    toggleTorch,
  };
}

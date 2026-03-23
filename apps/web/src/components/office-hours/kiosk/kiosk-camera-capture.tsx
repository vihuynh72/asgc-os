"use client";

import { useEffect, useMemo } from "react";

import { resolveKioskCameraSurface } from "@/lib/office-hours-kiosk/camera-controls.mjs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useKioskCamera } from "./use-kiosk-camera";

function PreviewImage({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Selfie preview" className="kiosk-camera-frame" />;
}

export function KioskCameraCapture({
  value,
  disabled,
  autoStart = false,
  onChange,
}: {
  value: File | null;
  disabled: boolean;
  autoStart?: boolean;
  onChange: (file: File | null) => void;
}) {
  const {
    canUseCamera,
    videoRef,
    cameraState,
    cameraError,
    videoReady,
    setVideoReady,
    warmTooLong,
    capturing,
    controlState,
    zoom,
    torchOn,
    dragZooming,
    mirrorPreview,
    start,
    stop,
    capture,
    rotateCamera,
    setZoomLevel,
    toggleTorch,
    beginDragZoom,
    updateDragZoom,
    endDragZoom,
  } = useKioskCamera({
    disabled,
    onCapture: (file) => onChange(file),
  });

  useEffect(() => {
    if (value) {
      stop();
    }
  }, [stop, value]);

  useEffect(() => {
    if (!autoStart || disabled || value || !canUseCamera || cameraState !== "idle") return;
    void start({ facingMode: "user" });
  }, [autoStart, cameraState, canUseCamera, disabled, start, value]);

  const surface = resolveKioskCameraSurface({
    hasValue: Boolean(value),
    canUseCamera,
    cameraState,
  });

  return (
    <div className="kiosk-control-grid">
      {surface === "preview" ? (
        <div className="kiosk-control-grid">
          {value ? <PreviewImage file={value} /> : null}
          <Button variant="outline" className="kiosk-camera-secondary h-12 rounded-xl" onClick={() => onChange(null)} disabled={disabled}>
            ↺ Retake
          </Button>
        </div>
      ) : null}

      {surface === "live" ? (
        <div className="kiosk-control-grid">
          <div
            className={cn(
              "kiosk-camera-frame kiosk-camera-frame-live",
              controlState.canZoom ? "touch-none" : undefined,
              dragZooming ? "kiosk-camera-frame-zooming" : undefined,
            )}
            onPointerDown={(event) => {
              const started = beginDragZoom({
                pointerId: event.pointerId,
                clientY: event.clientY,
                pointerType: event.pointerType,
                surfaceHeight: event.currentTarget.getBoundingClientRect().height,
              });
              if (started) {
                event.currentTarget.setPointerCapture(event.pointerId);
              }
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              void updateDragZoom({
                pointerId: event.pointerId,
                clientY: event.clientY,
              });
            }}
            onPointerUp={(event) => {
              endDragZoom({ pointerId: event.pointerId });
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={(event) => {
              endDragZoom({ pointerId: event.pointerId });
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setVideoReady(true)}
              onCanPlay={() => setVideoReady(true)}
              onPlaying={() => setVideoReady(true)}
              className={cn("aspect-[4/5] w-full object-cover", mirrorPreview ? "scale-x-[-1]" : undefined)}
            />
            {!videoReady ? <div className="kiosk-camera-overlay">Starting camera…</div> : null}
            {controlState.canZoom && zoom !== null ? (
              <div className="kiosk-camera-zoom-readout">{zoom.toFixed(1)}x</div>
            ) : null}
            {controlState.canZoom ? (
              <div className="kiosk-camera-gesture-hint md:hidden">Drag up or down to zoom.</div>
            ) : null}
          </div>

          <div className="kiosk-control-grid">
            <div className="kiosk-control-row kiosk-control-row-compact">
              <div>
                <div className="kiosk-control-label">Capture</div>
                <div className="text-sm text-slate-600">Front camera, mirrored selfie, high quality.</div>
              </div>
              {controlState.canZoom && zoom !== null ? (
                <span className="hidden rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 md:inline-flex">
                  {zoom.toFixed(1)}x
                </span>
              ) : null}
            </div>

            <div className="kiosk-control-row kiosk-control-row-split">
              {controlState.canFlip ? (
                <Button variant="outline" className="kiosk-camera-pill h-11 rounded-full px-4" onClick={() => void rotateCamera()} disabled={disabled}>
                  ↺ Flip
                </Button>
              ) : null}
              {controlState.canTorch ? (
                <Button variant="outline" className="kiosk-camera-pill h-11 rounded-full px-4" onClick={() => void toggleTorch()} disabled={disabled}>
                  {torchOn ? "✦ Flash off" : "✦ Flash"}
                </Button>
              ) : null}
            </div>

            {controlState.canZoom && controlState.zoomRange ? (
              <label className="hidden space-y-2 md:block">
                <div className="kiosk-control-label">Zoom</div>
                <input
                  className="kiosk-camera-zoom-slider"
                  type="range"
                  min={controlState.zoomRange.min}
                  max={controlState.zoomRange.max}
                  step={controlState.zoomRange.step}
                  value={zoom ?? controlState.zoomRange.min}
                  onChange={(event) => void setZoomLevel(Number(event.target.value))}
                  disabled={disabled}
                />
              </label>
            ) : null}
          </div>

          <Button className="kiosk-camera-primary h-14 rounded-xl text-base" onClick={() => void capture()} disabled={disabled || capturing || !videoReady}>
            {capturing ? "Capturing…" : "● Capture"}
          </Button>
          {warmTooLong ? (
            <Button variant="outline" className="kiosk-camera-secondary h-11 rounded-xl" onClick={() => void start()} disabled={disabled}>
              Retry
            </Button>
          ) : null}
          <Button variant="outline" className="kiosk-camera-secondary h-11 rounded-xl" onClick={stop} disabled={disabled}>
            Close camera
          </Button>
          {cameraError ? <p className="text-xs text-rose-700">{cameraError}</p> : null}
        </div>
      ) : null}

      {surface === "prompt" ? (
        <div className="kiosk-control-grid">
          <Button
            className="kiosk-camera-primary h-14 rounded-xl text-base"
            variant="outline"
            onClick={() => void start()}
            disabled={disabled || !canUseCamera || cameraState === "starting"}
          >
            {cameraState === "starting" ? "Requesting…" : "◎ Open camera"}
          </Button>
          {cameraError ? <p className="text-xs text-rose-700">{cameraError}</p> : null}
        </div>
      ) : null}

      {surface === "unavailable" ? (
        <div className="kiosk-control-grid">
          <Button className="kiosk-camera-secondary h-14 rounded-xl text-base" variant="outline" disabled>
            Camera unavailable
          </Button>
          <p className="text-xs text-foreground/60">Use a device with camera access for kiosk check-in.</p>
        </div>
      ) : null}
    </div>
  );
}

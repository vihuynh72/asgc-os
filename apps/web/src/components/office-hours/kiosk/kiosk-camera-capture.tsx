"use client";

import { useEffect, useMemo } from "react";

import { Button } from "@/components/ui/button";

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
  onChange,
}: {
  value: File | null;
  disabled: boolean;
  onChange: (file: File | null) => void;
}) {
  const {
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
  } = useKioskCamera({
    disabled,
    onCapture: (file) => onChange(file),
  });

  useEffect(() => {
    if (value) {
      stop();
    }
  }, [stop, value]);

  return (
    <div className="kiosk-control-grid">
      <div className="kiosk-control-row kiosk-control-row-split">
        <Button
          variant={mode === "camera" ? "default" : "outline"}
          className="kiosk-camera-pill h-11 rounded-full px-4"
          onClick={() => setMode("camera")}
          disabled={!canUseCamera || disabled}
        >
          ◎ Live
        </Button>
        <Button
          variant={mode === "file" ? "default" : "outline"}
          className="kiosk-camera-pill h-11 rounded-full px-4"
          onClick={() => {
            setMode("file");
            stop();
          }}
          disabled={disabled}
        >
          ↑ Upload
        </Button>
      </div>

      {value ? (
        <div className="kiosk-control-grid">
          <PreviewImage file={value} />
          <Button variant="outline" className="kiosk-camera-secondary h-12 rounded-xl" onClick={() => onChange(null)} disabled={disabled}>
            ↺ Retake
          </Button>
        </div>
      ) : null}

      {!value && mode === "camera" ? (
        <div className="kiosk-control-grid">
          {cameraState === "ready" ? (
            <>
              <div className="kiosk-camera-frame">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => setVideoReady(true)}
                  onCanPlay={() => setVideoReady(true)}
                  onPlaying={() => setVideoReady(true)}
                  className="aspect-[4/5] w-full object-cover"
                />
                {!videoReady ? <div className="kiosk-camera-overlay">Starting camera…</div> : null}
              </div>

              <div className="kiosk-control-grid">
                <div className="kiosk-control-row kiosk-control-row-compact">
                  <label className="kiosk-control-label">Quality</label>
                  <select
                    className="h-11 rounded-full border border-[var(--admin-border-soft)] bg-white/85 px-3 text-sm"
                    value={quality}
                    onChange={(event) => setQuality(event.target.value as "balanced" | "high")}
                    disabled={disabled}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="high">High</option>
                  </select>
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
                  <label className="space-y-2">
                    <div className="kiosk-control-label">Zoom</div>
                    <input
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
            </>
          ) : (
            <>
              <Button
                className="kiosk-camera-primary h-14 rounded-xl text-base"
                variant="outline"
                onClick={() => void start()}
                disabled={disabled || !canUseCamera || cameraState === "starting"}
              >
                {cameraState === "starting" ? "Requesting…" : "◎ Open camera"}
              </Button>
            </>
          )}
          {cameraError ? <p className="text-xs text-rose-700 dark:text-rose-300">{cameraError}</p> : null}
        </div>
      ) : null}

      {!value && mode === "file" ? (
        <div className="kiosk-control-grid">
          <input
            type="file"
            accept="image/*"
            capture={controlState.facingMode as "user" | "environment"}
            onChange={(event) => onChange(event.target.files?.[0] ?? null)}
            disabled={disabled}
            className="block w-full rounded-xl border border-[var(--admin-border-soft)] bg-white/80 px-3 py-2 text-sm"
          />
        </div>
      ) : null}
    </div>
  );
}

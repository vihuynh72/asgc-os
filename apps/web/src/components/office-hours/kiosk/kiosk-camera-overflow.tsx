"use client";

import { useEffect, useRef, useState } from "react";

export function KioskCameraOverflowMenu({
  canFlip,
  canTorch,
  torchOn,
  onFlip,
  onTorch,
}: {
  canFlip: boolean;
  canTorch: boolean;
  torchOn: boolean;
  onFlip: () => void;
  onTorch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onClickOutside);
    return () => document.removeEventListener("pointerdown", onClickOutside);
  }, [open]);

  if (!canFlip && !canTorch) return null;

  return (
    <div ref={ref}>
      <button
        type="button"
        className="kiosk-camera-overflow-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-label="Camera options"
      >
        ...
      </button>

      {open && (
        <div className="kiosk-camera-overflow-menu">
          {canFlip && (
            <button
              type="button"
              onClick={() => {
                onFlip();
                setOpen(false);
              }}
            >
              Flip camera
            </button>
          )}
          {canTorch && (
            <button
              type="button"
              onClick={() => {
                onTorch();
                setOpen(false);
              }}
            >
              {torchOn ? "Flash off" : "Flash on"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

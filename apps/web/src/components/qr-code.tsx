"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({
  value,
  size = 220,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);

    QRCode.toDataURL(value, {
      margin: 1,
      width: size,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0b0c", light: "#ffffff" },
    })
      .then((url: string) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [size, value]);

  if (!dataUrl) {
    return (
      <div
        className={className ?? "flex items-center justify-center rounded-2xl bg-muted/40"}
        style={{ width: size, height: size }}
        aria-label="Generating QR code"
      />
    );
  }

  return <img src={dataUrl} alt="QR code" width={size} height={size} className={className} />;
}

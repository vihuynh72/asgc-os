export type KioskStatusTone = "critical" | "warning" | "neutral" | "good";

export type KioskEntryStep = "email" | "selfie" | "location" | "action" | "checked_in";

export type KioskDistanceBand = "in_radius" | "in_grace" | "outside_grace";

export type KioskCameraControlState = {
  canFlip: boolean;
  canZoom: boolean;
  zoomRange: { min: number; max: number; step: number } | null;
  canTorch: boolean;
  facingMode: "user" | "environment";
  cameraCount: number;
};

export type KioskAllowlistDecision =
  | { allowed: true }
  | { allowed: false; reason: "email_blocked" | "email_disabled" | "email_not_allowed" };

export type KioskLocationPreflightResult = {
  ok: boolean;
  decision: KioskAllowlistDecision;
  dayAllowed: boolean;
  distanceM: number;
  radiusM: number;
  graceRadiusM: number;
  band: KioskDistanceBand;
  statusTone: KioskStatusTone;
  statusLabel: string;
  error?: string;
};

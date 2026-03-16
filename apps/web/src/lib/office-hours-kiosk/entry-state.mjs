const STATUS_BY_BAND = {
  in_radius: { statusTone: "good", statusLabel: "In range" },
  in_grace: { statusTone: "warning", statusLabel: "Grace zone" },
  outside_grace: { statusTone: "critical", statusLabel: "Out of range" },
};

export function mapDistanceToPreflightStatus({ distanceM, radiusM, graceRadiusM }) {
  if (!Number.isFinite(distanceM) || !Number.isFinite(radiusM) || !Number.isFinite(graceRadiusM)) {
    return { band: "outside_grace", statusTone: "critical", statusLabel: "Out of range" };
  }

  if (distanceM <= radiusM) {
    return { band: "in_radius", ...STATUS_BY_BAND.in_radius };
  }
  if (distanceM <= graceRadiusM) {
    return { band: "in_grace", ...STATUS_BY_BAND.in_grace };
  }

  return { band: "outside_grace", ...STATUS_BY_BAND.outside_grace };
}

export function deriveKioskIntentBranch({
  statusResolved,
  hasOpenSession,
}) {
  if (!statusResolved) return "status";
  return hasOpenSession ? "check_out" : "check_in";
}

export function deriveKioskVerificationStep({
  otpVerified,
  requiresLocation,
  preflightReady,
  preflightAllowed,
}) {
  if (!otpVerified) return "otp";
  if (requiresLocation && (!preflightReady || !preflightAllowed)) return "location";
  return "action";
}

export function canSubmitKioskCheckIn({
  otpVerified,
  preflightReady,
  preflightAllowed,
}) {
  return Boolean(otpVerified && preflightReady && preflightAllowed);
}

export function canSubmitKioskCheckOut({
  otpVerified,
}) {
  return Boolean(otpVerified);
}

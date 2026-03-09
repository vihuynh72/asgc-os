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

export function deriveKioskEntryBranch({
  emailValid,
  statusResolved,
  hasOpenSession,
}) {
  if (!emailValid || !statusResolved) return "email";
  return hasOpenSession ? "check_out" : "check_in";
}

export function deriveKioskCheckInStep({
  hasPhoto,
  preflightReady,
  preflightAllowed,
}) {
  if (!hasPhoto) return "selfie";
  if (!preflightReady || !preflightAllowed) return "location";
  return "action";
}

export function canSubmitKioskCheckIn({
  emailValid,
  hasPhoto,
  preflightReady,
  preflightAllowed,
}) {
  return Boolean(emailValid && hasPhoto && preflightReady && preflightAllowed);
}

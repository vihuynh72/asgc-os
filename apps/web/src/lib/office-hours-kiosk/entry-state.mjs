const STATUS_BY_BAND = {
  in_radius: { statusTone: "good", statusLabel: "In range" },
  in_grace: { statusTone: "warning", statusLabel: "Grace zone" },
  outside_grace: { statusTone: "critical", statusLabel: "Out of range" },
};
const WIZARD_STEPS = new Set(["email", "selfie", "location", "action"]);

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

export function deriveKioskEntryStep({
  emailValid,
  hasPhoto,
  hasOpenSession,
  preflightReady,
  preflightAllowed,
}) {
  if (hasOpenSession) return "checked_in";
  if (!emailValid) return "email";
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

export function normalizeKioskWizardStep(stepId) {
  if (stepId === "checked_in") return "action";
  return WIZARD_STEPS.has(stepId) ? stepId : "email";
}

export function deriveKioskStickyAction({
  hasOpenSession,
  emailValid,
  hasPhoto,
  preflightReady,
  preflightAllowed,
  loading,
}) {
  if (hasOpenSession) {
    if (loading) {
      return { mode: "check_out", label: "Checking out…", disabled: true, tone: "good" };
    }
    if (!emailValid) {
      return { mode: "check_out", label: "Enter email", disabled: true, tone: "warning" };
    }
    return { mode: "check_out", label: "Check out", disabled: false, tone: "good" };
  }

  if (loading) {
    return { mode: "check_in", label: "Checking in…", disabled: true, tone: "good" };
  }

  const canCheckIn = canSubmitKioskCheckIn({
    emailValid,
    hasPhoto,
    preflightReady,
    preflightAllowed,
  });

  if (canCheckIn) {
    return { mode: "check_in", label: "Check in", disabled: false, tone: "good" };
  }

  return { mode: "check_in", label: "Complete steps", disabled: true, tone: "warning" };
}

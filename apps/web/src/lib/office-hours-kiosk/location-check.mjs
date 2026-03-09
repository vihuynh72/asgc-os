import { mapDistanceToPreflightStatus } from "./entry-state.mjs";

export function shapeLocationCheckResult({
  decision,
  dayAllowed,
  distanceM,
  radiusM,
  graceRadiusM,
}) {
  const status = mapDistanceToPreflightStatus({ distanceM, radiusM, graceRadiusM });

  if (!decision?.allowed) {
    return {
      ok: false,
      decision,
      dayAllowed,
      distanceM,
      radiusM,
      graceRadiusM,
      band: status.band,
      statusTone: "critical",
      statusLabel: "Access required",
    };
  }

  if (!dayAllowed) {
    return {
      ok: false,
      decision,
      dayAllowed,
      distanceM,
      radiusM,
      graceRadiusM,
      band: status.band,
      statusTone: "warning",
      statusLabel: "Day unavailable",
    };
  }

  return {
    ok: status.band !== "outside_grace",
    decision,
    dayAllowed,
    distanceM,
    radiusM,
    graceRadiusM,
    band: status.band,
    statusTone: status.statusTone,
    statusLabel: status.statusLabel,
  };
}

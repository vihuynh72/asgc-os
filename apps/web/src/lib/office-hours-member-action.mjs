export function deriveMemberActionMode({ openSessionId }) {
  return openSessionId ? "check_out" : "check_in";
}

export function canSubmitMemberCheckIn({ hasPhoto, preflightReady, preflightAllowed }) {
  return Boolean(hasPhoto && preflightReady && preflightAllowed);
}

export function deriveMemberActionStep({ mode, hasPhoto, preflightReady, preflightAllowed }) {
  if (mode === "check_out") return "confirm";
  if (!hasPhoto) return "selfie";
  if (!preflightReady || !preflightAllowed) return "location";
  return "submit";
}

export function friendlyMemberActionError(code) {
  switch (code) {
    case "outside_geofence":
      return "You appear to be outside the office check-in area.";
    case "already_checked_in":
      return "You already have an open session.";
    case "no_open_session":
      return "No open session was found.";
    case "location_required":
      return "Location is required to check in.";
    case "weekend_not_allowed":
      return "Office hours are not enabled today.";
    case "office_location_not_configured":
      return "Office location is not configured yet.";
    case "photo_required":
      return "A selfie is required to check in.";
    default:
      return code || "Something went wrong.";
  }
}

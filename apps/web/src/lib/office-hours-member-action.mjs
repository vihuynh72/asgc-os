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
    case "invalid_session":
      return "Your session updated, but this screen needs a refresh.";
    case "photo_upload_failed":
      return "The selfie upload failed. Try the check-in again.";
    case "photo_update_failed":
      return "Your selfie saved, but the session could not finish updating.";
    case "unauthorized":
      return "Sign in again to continue.";
    case "password_setup_required":
      return "Finish your password setup before using Office Hours.";
    case "office_hours_role_required":
      return "You do not have an active Office Hours role right now.";
    default:
      return code || "Something went wrong.";
  }
}

export function resolveMemberActionSessionDrift({ attemptedMode, errorCode, refreshedSession }) {
  if (attemptedMode === "check_out" && errorCode === "no_open_session" && !refreshedSession) {
    return {
      nextOpenSession: null,
      clearError: true,
      lifecycleEvent: "closed",
    };
  }

  if (attemptedMode === "check_in" && errorCode === "already_checked_in" && refreshedSession?.id) {
    return {
      nextOpenSession: refreshedSession,
      clearError: true,
      lifecycleEvent: "opened",
    };
  }

  return null;
}

export const OFFICE_HOURS_SESSION_OPENED_EVENT = "office-hours:session-opened";
export const OFFICE_HOURS_SESSION_CLOSED_EVENT = "office-hours:session-closed";

export const OFFICE_HOURS_PRESENCE_TIMEOUT_MINUTES = 15;
export const OFFICE_HOURS_PRESENCE_ENFORCE_AFTER_HOUR_LOCAL = 17;

export function getOfficeHoursPresencePolicy() {
  return {
    inactivityTimeoutMinutes: OFFICE_HOURS_PRESENCE_TIMEOUT_MINUTES,
    enforceAfterHourLocal: OFFICE_HOURS_PRESENCE_ENFORCE_AFTER_HOUR_LOCAL,
    daytimeAutoCloseEnabled: false,
  };
}

export function reducePresenceMonitorSessionState({ currentOpenSessionId, type, sessionId }) {
  if (type === OFFICE_HOURS_SESSION_OPENED_EVENT) {
    return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : currentOpenSessionId;
  }

  if (type === OFFICE_HOURS_SESSION_CLOSED_EVENT) {
    if (!currentOpenSessionId) return null;
    if (!sessionId) return null;
    return currentOpenSessionId === sessionId ? null : currentOpenSessionId;
  }

  return currentOpenSessionId;
}

function dispatchOfficeHoursPresenceEvent(type, sessionId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(type, {
      detail: {
        sessionId: typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null,
      },
    }),
  );
}

export function dispatchOfficeHoursSessionOpened(sessionId) {
  dispatchOfficeHoursPresenceEvent(OFFICE_HOURS_SESSION_OPENED_EVENT, sessionId);
}

export function dispatchOfficeHoursSessionClosed(sessionId) {
  dispatchOfficeHoursPresenceEvent(OFFICE_HOURS_SESSION_CLOSED_EVENT, sessionId);
}

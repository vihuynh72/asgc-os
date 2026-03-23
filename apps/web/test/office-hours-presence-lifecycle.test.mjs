import test from "node:test";
import assert from "node:assert/strict";

import {
  OFFICE_HOURS_SESSION_CLOSED_EVENT,
  OFFICE_HOURS_SESSION_OPENED_EVENT,
  getOfficeHoursPresencePolicy,
  reducePresenceMonitorSessionState,
} from "../src/lib/office-hours-presence-lifecycle.mjs";

test("office-hours presence lifecycle exposes the signed-in kiosk event names", () => {
  assert.equal(OFFICE_HOURS_SESSION_OPENED_EVENT, "office-hours:session-opened");
  assert.equal(OFFICE_HOURS_SESSION_CLOSED_EVENT, "office-hours:session-closed");
});

test("reducePresenceMonitorSessionState starts monitoring immediately when a session opens", () => {
  assert.equal(
    reducePresenceMonitorSessionState({
      currentOpenSessionId: null,
      type: OFFICE_HOURS_SESSION_OPENED_EVENT,
      sessionId: "session-123",
    }),
    "session-123",
  );
});

test("reducePresenceMonitorSessionState stops monitoring when the current session closes", () => {
  assert.equal(
    reducePresenceMonitorSessionState({
      currentOpenSessionId: "session-123",
      type: OFFICE_HOURS_SESSION_CLOSED_EVENT,
      sessionId: "session-123",
    }),
    null,
  );
});

test("getOfficeHoursPresencePolicy matches the intended after-5pm 15-minute behavior", () => {
  assert.deepEqual(getOfficeHoursPresencePolicy(), {
    inactivityTimeoutMinutes: 15,
    enforceAfterHourLocal: 17,
    daytimeAutoCloseEnabled: false,
  });
});

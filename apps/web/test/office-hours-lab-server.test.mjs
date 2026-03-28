import test from "node:test";
import assert from "node:assert/strict";

import {
  runOfficeHoursLabAdminCloseLiveProbe,
  runOfficeHoursLabKioskCheckInLiveProbe,
  runOfficeHoursLabShiftCreationLiveProbe,
} from "../src/lib/office-hours-lab-server.ts";

test("runOfficeHoursLabKioskCheckInLiveProbe disables audit-style side effects and cleans up created artifacts", async () => {
  const calls = [];

  const result = await runOfficeHoursLabKioskCheckInLiveProbe({
    timestamp: "2026-03-30T10:00:00-07:00",
    lat: 32.7157,
    lon: -117.1611,
    createVerifiedChallenge: async () => ({
      id: "challenge-1",
      user_id: "user-1",
      phone_e164: "+15551234567",
      verified_at: "2026-03-30T09:59:00-07:00",
    }),
    performCheckIn: async (input) => {
      calls.push(input);
      return {
        session: {
          id: "session-1",
          checkin_at: "2026-03-30T10:00:00-07:00",
          within_grace: false,
          within_radius: true,
        },
      };
    },
    cleanupArtifacts: async (artifacts) => {
      calls.push({ cleanup: artifacts });
      return { ok: true, message: null };
    },
  });

  assert.equal(calls[0].options.recordAudit, false);
  assert.equal(calls[0].options.markChallengeUsed, false);
  assert.deepEqual(calls[1], { cleanup: { challengeId: "challenge-1", sessionId: "session-1" } });
  assert.equal(result.resultCode, "kiosk_check_in_ok");
  assert.equal(result.cleanup.ok, true);
});

test("runOfficeHoursLabKioskCheckInLiveProbe still attempts cleanup when the live probe throws", async () => {
  const cleanedArtifacts = [];

  const result = await runOfficeHoursLabKioskCheckInLiveProbe({
    timestamp: "2026-03-30T10:00:00-07:00",
    lat: 32.7157,
    lon: -117.1611,
    createVerifiedChallenge: async () => ({
      id: "challenge-2",
      user_id: "user-2",
      phone_e164: "+15557654321",
      verified_at: "2026-03-30T09:59:00-07:00",
    }),
    performCheckIn: async () => {
      throw new Error("outside_geofence");
    },
    cleanupArtifacts: async (artifacts) => {
      cleanedArtifacts.push(artifacts);
      return { ok: true, message: null };
    },
  });

  assert.deepEqual(cleanedArtifacts, [{ challengeId: "challenge-2", sessionId: null }]);
  assert.equal(result.errorCode, "outside_geofence");
  assert.equal(result.cleanup.ok, true);
});

test("runOfficeHoursLabAdminCloseLiveProbe suppresses notifications and cleans up temporary sessions", async () => {
  const calls = [];

  const result = await runOfficeHoursLabAdminCloseLiveProbe({
    timestamp: "2026-03-30T14:00:00-07:00",
    sessionSeed: {
      userId: "user-3",
      checkinAt: "2026-03-30T12:00:00-07:00",
    },
    adminClose: {
      checkoutAt: "2026-03-30T13:00:00-07:00",
      excludeFromTotals: false,
      reason: "Lab validation",
    },
    createTemporarySession: async () => ({
      id: "session-3",
      user_id: "user-3",
    }),
    closeSession: async (input) => {
      calls.push(input);
      return {
        session: {
          id: "session-3",
          checkout_at: "2026-03-30T13:00:00-07:00",
        },
      };
    },
    cleanupArtifacts: async (artifacts) => {
      calls.push({ cleanup: artifacts });
      return { ok: true, message: null };
    },
  });

  assert.equal(calls[0].options.suppressNotification, true);
  assert.deepEqual(calls[1], { cleanup: { sessionId: "session-3", auditTargetId: "session-3" } });
  assert.equal(result.resultCode, "admin_close_valid");
  assert.equal(result.cleanup.ok, true);
});

test("runOfficeHoursLabShiftCreationLiveProbe cleans up created shifts after verification", async () => {
  const calls = [];

  const result = await runOfficeHoursLabShiftCreationLiveProbe({
    timestamp: "2026-03-30T14:00:00-07:00",
    shift: {
      userId: "user-4",
      startsAt: "2026-03-30T15:00:00-07:00",
      endsAt: "2026-03-30T16:00:00-07:00",
      officeLocationId: "office-1",
    },
    createShift: async (input) => {
      calls.push(input);
      return { id: "shift-1" };
    },
    cleanupArtifacts: async (artifacts) => {
      calls.push({ cleanup: artifacts });
      return { ok: true, message: null };
    },
  });

  assert.equal(calls[0].userId, "user-4");
  assert.deepEqual(calls[1], { cleanup: { shiftId: "shift-1", auditTargetId: "shift-1" } });
  assert.equal(result.resultCode, "shift_live_verified");
  assert.equal(result.cleanup.ok, true);
});

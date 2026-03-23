import test from "node:test";
import assert from "node:assert/strict";

import {
  getMemberKioskStateSummary,
  getMemberKioskFlowModel,
  normalizeMemberCheckInSession,
} from "../src/lib/office-hours-member-kiosk.mjs";

test("normalizeMemberCheckInSession accepts the RPC session_id shape and returns a stable id field", () => {
  assert.deepEqual(
    normalizeMemberCheckInSession({
      session_id: "session-1",
      checkin_at: "2026-03-22T19:25:08.000Z",
      distance_m: 12,
    }),
    {
      session_id: "session-1",
      id: "session-1",
      checkin_at: "2026-03-22T19:25:08.000Z",
      distance_m: 12,
    },
  );

  assert.deepEqual(
    normalizeMemberCheckInSession([
      {
        id: "session-2",
        checkin_at: "2026-03-22T19:30:00.000Z",
      },
    ]),
    {
      id: "session-2",
      checkin_at: "2026-03-22T19:30:00.000Z",
    },
  );

  assert.equal(normalizeMemberCheckInSession({ checkin_at: "2026-03-22T19:30:00.000Z" }), null);
});

test("getMemberKioskStateSummary keeps mobile status copy compact for check-in and check-out", () => {
  assert.deepEqual(
    getMemberKioskStateSummary({
      mode: "check_in",
      currentStep: "selfie",
    }),
    {
      tone: "neutral",
      chipLabel: "Selfie first",
      title: "Take a fresh selfie",
      detail: "Capture your photo to unlock check-in.",
      hint: "Selfie first, then location.",
    },
  );

  assert.deepEqual(
    getMemberKioskStateSummary({
      mode: "check_in",
      currentStep: "submit",
    }),
    {
      tone: "good",
      chipLabel: "Ready",
      title: "Ready to check in",
      detail: "Selfie and location are set.",
      hint: "Check in to start your session.",
    },
  );

  assert.deepEqual(
    getMemberKioskStateSummary({
      mode: "check_out",
      currentStep: "confirm",
    }),
    {
      tone: "good",
      chipLabel: "Checked in",
      title: "Ready to check out",
      detail: "You already have an open session.",
      hint: "Check out when you are done.",
    },
  );
});

test("getMemberKioskFlowModel reveals one mobile step at a time for check-in", () => {
  assert.deepEqual(
    getMemberKioskFlowModel({
      mode: "check_in",
      hasPhoto: false,
      preflightReady: false,
      preflightAllowed: false,
    }),
    {
      currentStep: "selfie",
      nextSectionId: "selfie",
      sections: [
        { id: "selfie", state: "current", expanded: true },
        { id: "location", state: "locked", expanded: false },
        { id: "action", state: "locked", expanded: false },
      ],
    },
  );

  assert.deepEqual(
    getMemberKioskFlowModel({
      mode: "check_in",
      hasPhoto: true,
      preflightReady: false,
      preflightAllowed: false,
    }),
    {
      currentStep: "location",
      nextSectionId: "location",
      sections: [
        { id: "selfie", state: "complete", expanded: false },
        { id: "location", state: "current", expanded: true },
        { id: "action", state: "locked", expanded: false },
      ],
    },
  );

  assert.deepEqual(
    getMemberKioskFlowModel({
      mode: "check_in",
      hasPhoto: true,
      preflightReady: true,
      preflightAllowed: true,
    }),
    {
      currentStep: "submit",
      nextSectionId: "action",
      sections: [
        { id: "selfie", state: "complete", expanded: false },
        { id: "location", state: "complete", expanded: false },
        { id: "action", state: "current", expanded: true },
      ],
    },
  );
});

test("getMemberKioskFlowModel collapses the member kiosk into a lightweight checked-in state", () => {
  assert.deepEqual(
    getMemberKioskFlowModel({
      mode: "check_out",
      hasPhoto: false,
      preflightReady: false,
      preflightAllowed: false,
    }),
    {
      currentStep: "confirm",
      nextSectionId: "action",
      sections: [
        { id: "session", state: "complete", expanded: false },
        { id: "action", state: "current", expanded: true },
      ],
    },
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  canSubmitMemberCheckIn,
  deriveMemberActionMode,
  deriveMemberActionStep,
  friendlyMemberActionError,
} from "../src/lib/office-hours-member-action.mjs";

test("deriveMemberActionMode switches between selfie check-in and direct checkout", () => {
  assert.equal(deriveMemberActionMode({ openSessionId: null }), "check_in");
  assert.equal(deriveMemberActionMode({ openSessionId: "session-1" }), "check_out");
});

test("canSubmitMemberCheckIn requires a selfie and an allowed location", () => {
  assert.equal(
    canSubmitMemberCheckIn({
      hasPhoto: true,
      preflightReady: true,
      preflightAllowed: true,
    }),
    true,
  );

  assert.equal(
    canSubmitMemberCheckIn({
      hasPhoto: false,
      preflightReady: true,
      preflightAllowed: true,
    }),
    false,
  );

  assert.equal(
    canSubmitMemberCheckIn({
      hasPhoto: true,
      preflightReady: false,
      preflightAllowed: true,
    }),
    false,
  );
});

test("deriveMemberActionStep keeps check-in on selfie first and checkout on confirm", () => {
  assert.equal(
    deriveMemberActionStep({
      mode: "check_in",
      hasPhoto: false,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "selfie",
  );

  assert.equal(
    deriveMemberActionStep({
      mode: "check_in",
      hasPhoto: true,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "location",
  );

  assert.equal(
    deriveMemberActionStep({
      mode: "check_in",
      hasPhoto: true,
      preflightReady: true,
      preflightAllowed: true,
    }),
    "submit",
  );

  assert.equal(
    deriveMemberActionStep({
      mode: "check_out",
      hasPhoto: false,
      preflightReady: false,
      preflightAllowed: false,
    }),
    "confirm",
  );
});

test("friendlyMemberActionError keeps Office Hours errors concise", () => {
  assert.equal(friendlyMemberActionError("outside_geofence"), "You appear to be outside the office check-in area.");
  assert.equal(friendlyMemberActionError("already_checked_in"), "You already have an open session.");
  assert.equal(friendlyMemberActionError("no_open_session"), "No open session was found.");
  assert.equal(friendlyMemberActionError("invalid_session"), "Your session updated, but this screen needs a refresh.");
});

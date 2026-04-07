import test from "node:test";
import assert from "node:assert/strict";

import {
  isEligibleOfficeHoursRole,
  resolveOfficeHoursMemberAccess,
} from "../src/lib/office-hours-member-auth.mjs";

test("isEligibleOfficeHoursRole accepts advisor and volunteer as first-class Office Hours members", () => {
  assert.equal(isEligibleOfficeHoursRole("advisor"), true);
  assert.equal(isEligibleOfficeHoursRole("volunteer"), true);
  assert.equal(isEligibleOfficeHoursRole("president"), true);
  assert.equal(isEligibleOfficeHoursRole(null), false);
  assert.equal(isEligibleOfficeHoursRole("staff"), false);
});

test("resolveOfficeHoursMemberAccess blocks password setup before role eligibility", () => {
  assert.deepEqual(
    resolveOfficeHoursMemberAccess({
      passwordReadyStatus: "missing",
      officeHoursRoleKey: "advisor",
      hasOpenSession: false,
    }),
    {
      authStatus: "needs_password",
      canCheckIn: false,
      canCheckOut: false,
      roleEligible: true,
    },
  );
});

test("resolveOfficeHoursMemberAccess allows eligible advisor and volunteer check-ins", () => {
  assert.deepEqual(
    resolveOfficeHoursMemberAccess({
      passwordReadyStatus: "ready",
      officeHoursRoleKey: "advisor",
      hasOpenSession: false,
    }),
    {
      authStatus: "authenticated",
      canCheckIn: true,
      canCheckOut: false,
      roleEligible: true,
    },
  );

  assert.deepEqual(
    resolveOfficeHoursMemberAccess({
      passwordReadyStatus: "ready",
      officeHoursRoleKey: "volunteer",
      hasOpenSession: false,
    }),
    {
      authStatus: "authenticated",
      canCheckIn: true,
      canCheckOut: false,
      roleEligible: true,
    },
  );
});

test("resolveOfficeHoursMemberAccess distinguishes role-ineligible members from signed-in members with open sessions", () => {
  assert.deepEqual(
    resolveOfficeHoursMemberAccess({
      passwordReadyStatus: "ready",
      officeHoursRoleKey: null,
      hasOpenSession: false,
    }),
    {
      authStatus: "role_ineligible",
      canCheckIn: false,
      canCheckOut: false,
      roleEligible: false,
    },
  );

  assert.deepEqual(
    resolveOfficeHoursMemberAccess({
      passwordReadyStatus: "ready",
      officeHoursRoleKey: null,
      hasOpenSession: true,
    }),
    {
      authStatus: "authenticated",
      canCheckIn: false,
      canCheckOut: true,
      roleEligible: false,
    },
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  canAccessOfficeHoursAdmin,
  canEditOfficeHoursMemberFlow,
  canEditOfficeHoursPhotoReview,
  canViewOfficeHoursMemberFlow,
} from "../src/lib/office-hours-authz.mjs";

test("canAccessOfficeHoursAdmin only allows full admins and EVP partial admins", () => {
  assert.equal(canAccessOfficeHoursAdmin({ tier: "full", isEvp: false }), true);
  assert.equal(canAccessOfficeHoursAdmin({ tier: "partial", isEvp: true }), true);
  assert.equal(canAccessOfficeHoursAdmin({ tier: "partial", isEvp: false }), false);
  assert.equal(canAccessOfficeHoursAdmin({ tier: "read-only", isEvp: true }), false);
  assert.equal(canAccessOfficeHoursAdmin({ tier: null, isEvp: false }), false);
});

test("Member Flow stays viewable to EVP but editable by full admins only", () => {
  assert.equal(canViewOfficeHoursMemberFlow({ tier: "full", isEvp: false }), true);
  assert.equal(canViewOfficeHoursMemberFlow({ tier: "partial", isEvp: true }), true);
  assert.equal(canViewOfficeHoursMemberFlow({ tier: "partial", isEvp: false }), false);

  assert.equal(canEditOfficeHoursMemberFlow({ tier: "full", isEvp: false }), true);
  assert.equal(canEditOfficeHoursMemberFlow({ tier: "partial", isEvp: true }), false);
});

test("photo review edits stay limited to full admins and EVP partial admins", () => {
  assert.equal(canEditOfficeHoursPhotoReview({ tier: "full", isEvp: false }), true);
  assert.equal(canEditOfficeHoursPhotoReview({ tier: "partial", isEvp: true }), true);
  assert.equal(canEditOfficeHoursPhotoReview({ tier: "partial", isEvp: false }), false);
  assert.equal(canEditOfficeHoursPhotoReview({ tier: "read-only", isEvp: true }), false);
});

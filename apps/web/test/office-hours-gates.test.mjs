import test from "node:test";
import assert from "node:assert/strict";

import {
  getOfficeHoursPasswordSetupRedirect,
  isLegacyOfficeHoursKioskPath,
  isOfficeHoursSelfServicePath,
  requiresProtectedAuth,
  requiresStepUpMfa,
} from "../src/lib/office-hours-gates.mjs";

test("requiresProtectedAuth keeps normal member routes authenticated", () => {
  assert.equal(requiresProtectedAuth("/dashboard"), true);
  assert.equal(requiresProtectedAuth("/office-hours"), true);
  assert.equal(requiresProtectedAuth("/office-hours/check-in"), true);
  assert.equal(requiresProtectedAuth("/login"), false);
});

test("requiresStepUpMfa is limited to admin and reviewer-sensitive routes", () => {
  assert.equal(requiresStepUpMfa("/dashboard"), false);
  assert.equal(requiresStepUpMfa("/office-hours/check-in"), false);
  assert.equal(requiresStepUpMfa("/office-hours/kiosk/review"), true);
  assert.equal(requiresStepUpMfa("/admin/office-hours"), true);
});

test("office hours self-service paths exclude the selfie review workspace", () => {
  assert.equal(isOfficeHoursSelfServicePath("/office-hours"), true);
  assert.equal(isOfficeHoursSelfServicePath("/office-hours/check-in"), true);
  assert.equal(isOfficeHoursSelfServicePath("/office-hours/check-out"), true);
  assert.equal(isOfficeHoursSelfServicePath("/office-hours/setup-password"), true);
  assert.equal(isOfficeHoursSelfServicePath("/office-hours/kiosk/review"), false);
});

test("legacy kiosk entry is only the public shim path", () => {
  assert.equal(isLegacyOfficeHoursKioskPath("/office-hours/kiosk"), true);
  assert.equal(isLegacyOfficeHoursKioskPath("/office-hours/kiosk/review"), false);
});

test("password setup redirects keep members inside office hours", () => {
  assert.equal(
    getOfficeHoursPasswordSetupRedirect("/office-hours/check-in?from=kiosk"),
    "/office-hours/setup-password?redirectTo=%2Foffice-hours%2Fcheck-in%3Ffrom%3Dkiosk",
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  OFFICE_HOURS_MEMBER_KIOSK_PATH,
  getOfficeHoursMemberRedirectTarget,
} from "../src/lib/office-hours-member-routing.mjs";

test("Office Hours member routes funnel into the signed-in kiosk", () => {
  assert.equal(OFFICE_HOURS_MEMBER_KIOSK_PATH, "/office-hours/kiosk");
  assert.equal(getOfficeHoursMemberRedirectTarget("/office-hours"), "/office-hours/kiosk");
  assert.equal(getOfficeHoursMemberRedirectTarget("/office-hours/check-in"), "/office-hours/kiosk");
  assert.equal(getOfficeHoursMemberRedirectTarget("/office-hours/check-out"), "/office-hours/kiosk");
  assert.equal(getOfficeHoursMemberRedirectTarget("/office-hours/setup-password"), null);
});

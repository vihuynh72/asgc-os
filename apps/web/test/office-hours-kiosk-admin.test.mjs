import test from "node:test";
import assert from "node:assert/strict";

import {
  isOfficeHoursKioskManagerTier,
  touchesOfficeHoursKioskSettings,
} from "../src/lib/office-hours-kiosk-admin.mjs";

test("isOfficeHoursKioskManagerTier allows only full admins", () => {
  assert.equal(isOfficeHoursKioskManagerTier("full"), true);
  assert.equal(isOfficeHoursKioskManagerTier("partial"), false);
  assert.equal(isOfficeHoursKioskManagerTier("read-only"), false);
  assert.equal(isOfficeHoursKioskManagerTier(null), false);
});

test("touchesOfficeHoursKioskSettings detects kiosk SMS config fields", () => {
  assert.equal(touchesOfficeHoursKioskSettings({ kiosk_sms_enabled: true }), true);
  assert.equal(touchesOfficeHoursKioskSettings({ kiosk_otp_ttl_minutes: 5 }), true);
  assert.equal(touchesOfficeHoursKioskSettings({ kiosk_checkout_reminder_interval_minutes: 60 }), true);
  assert.equal(touchesOfficeHoursKioskSettings({ weekly_hours_reminder_enabled: true }), false);
  assert.equal(touchesOfficeHoursKioskSettings(null), false);
});

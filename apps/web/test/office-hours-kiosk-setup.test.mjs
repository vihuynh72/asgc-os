import test from "node:test";
import assert from "node:assert/strict";

import {
  KIOSK_CONFIG_DEFAULTS,
  getOfficeHoursKioskSetupMessage,
  isOfficeHoursKioskSchemaError,
  normalizeOfficeHoursKioskError,
  withOfficeHoursKioskConfigDefaults,
} from "../src/lib/office-hours-kiosk-setup.mjs";

test("isOfficeHoursKioskSchemaError detects missing kiosk tables and columns", () => {
  assert.equal(
    isOfficeHoursKioskSchemaError("Could not find the table 'public.office_hours_kiosk_phone_allowlist' in the schema cache"),
    true,
  );
  assert.equal(
    isOfficeHoursKioskSchemaError("column office_config.kiosk_sms_enabled does not exist"),
    true,
  );
  assert.equal(
    isOfficeHoursKioskSchemaError("column office_hour_sessions.next_checkout_reminder_at does not exist"),
    true,
  );
  assert.equal(
    isOfficeHoursKioskSchemaError("relation public.profiles does not exist"),
    false,
  );
});

test("normalizeOfficeHoursKioskError maps setup failures to a stable code", () => {
  assert.equal(
    normalizeOfficeHoursKioskError("Could not find the table 'public.office_hours_kiosk_otp_challenges' in the schema cache"),
    "kiosk_setup_incomplete",
  );
  assert.equal(normalizeOfficeHoursKioskError("phone_not_allowed"), "phone_not_allowed");
});

test("withOfficeHoursKioskConfigDefaults fills kiosk config defaults and preserves setup flag", () => {
  const config = withOfficeHoursKioskConfigDefaults(
    {
      primary_office_location_id: "office-1",
      quiet_hours_enabled: true,
      quiet_hours_start_local: "18:30:00",
      quiet_hours_end_local: "07:30:00",
      weekly_hours_reminder_enabled: true,
      weekly_hours_reminder_weekday: 4,
      weekly_hours_reminder_time_local: "11:00:00",
      office_hours_allow_weekends: true,
      office_hours_allowed_weekdays: [1, 2],
      office_hours_extra_allowed_dates: ["2026-03-16"],
    },
    { kioskSchemaReady: false },
  );

  assert.equal(config.kiosk_sms_enabled, KIOSK_CONFIG_DEFAULTS.kiosk_sms_enabled);
  assert.equal(config.kiosk_otp_ttl_minutes, KIOSK_CONFIG_DEFAULTS.kiosk_otp_ttl_minutes);
  assert.equal(
    config.kiosk_checkout_reminder_interval_minutes,
    KIOSK_CONFIG_DEFAULTS.kiosk_checkout_reminder_interval_minutes,
  );
  assert.equal(config.kiosk_schema_ready, false);
});

test("getOfficeHoursKioskSetupMessage references the required migrations", () => {
  const message = getOfficeHoursKioskSetupMessage();
  assert.match(message, /202603160001_office_hours_kiosk_admin_foundation\.sql/);
  assert.match(message, /202603160002_office_hours_kiosk_sms_phase2\.sql/);
});

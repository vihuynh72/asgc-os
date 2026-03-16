import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKioskCheckoutReminderSmsText,
  buildKioskOtpSmsText,
} from "../src/lib/office-hours-kiosk-messages.mjs";

test("buildKioskOtpSmsText keeps the OTP message short and includes the expiry", () => {
  const text = buildKioskOtpSmsText({ code: "123456", expiresInMinutes: 5 });

  assert.match(text, /123456/);
  assert.match(text, /5 minute/i);
  assert.match(text, /ASGC/i);
});

test("buildKioskCheckoutReminderSmsText reports total elapsed time in hours and minutes", () => {
  const text = buildKioskCheckoutReminderSmsText({ elapsedMinutes: 125 });

  assert.match(text, /2h 5m/);
  assert.match(text, /check out/i);
});

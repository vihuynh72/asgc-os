import test from "node:test";
import assert from "node:assert/strict";

import {
  computeNextCheckoutReminderAt,
  hashKioskOtpCode,
  maskPhoneE164,
  normalizeKioskPhone,
  sortKioskMembers,
  verifyKioskOtpCode,
} from "../src/lib/office-hours-kiosk-auth.mjs";

test("normalizeKioskPhone formats supported US input into E.164", () => {
  assert.deepEqual(normalizeKioskPhone("(619) 555-1234"), {
    e164: "+16195551234",
    last4: "1234",
  });

  assert.deepEqual(normalizeKioskPhone("+1 619 555 5678"), {
    e164: "+16195555678",
    last4: "5678",
  });
});

test("normalizeKioskPhone rejects invalid numbers", () => {
  assert.equal(normalizeKioskPhone("555123"), null);
  assert.equal(normalizeKioskPhone("+44 20 7946 0958"), null);
});

test("maskPhoneE164 returns a stable masked display string", () => {
  assert.equal(maskPhoneE164("+16195551234"), "***-***-1234");
});

test("sortKioskMembers orders president first, then executives, then board members", () => {
  const sorted = sortKioskMembers([
    { user_id: "3", display_name: "Board Member B", role_key: "board_member", display_title: null },
    { user_id: "2", display_name: "Executive A", role_key: "executive", display_title: "Vice President" },
    { user_id: "4", display_name: "Board Member A", role_key: "board_member", display_title: null },
    { user_id: "1", display_name: "President", role_key: "president", display_title: null },
    { user_id: "5", display_name: "Executive B", role_key: "executive", display_title: "Director of Board Affairs" },
  ]);

  assert.deepEqual(
    sorted.map((row) => row.user_id),
    ["1", "2", "5", "4", "3"],
  );
});

test("hashKioskOtpCode and verifyKioskOtpCode produce deterministic OTP checks", () => {
  const hash = hashKioskOtpCode({
    challengeId: "challenge-1",
    code: "123456",
    secret: "super-secret",
  });

  assert.equal(
    verifyKioskOtpCode({
      challengeId: "challenge-1",
      code: "123456",
      hash,
      secret: "super-secret",
    }),
    true,
  );

  assert.equal(
    verifyKioskOtpCode({
      challengeId: "challenge-1",
      code: "999999",
      hash,
      secret: "super-secret",
    }),
    false,
  );
});

test("computeNextCheckoutReminderAt uses hourly cadence from check-in or the prior reminder", () => {
  assert.equal(
    computeNextCheckoutReminderAt({
      checkinAtIso: "2026-03-16T16:00:00.000Z",
      lastReminderAtIso: null,
      intervalMinutes: 60,
    }),
    "2026-03-16T17:00:00.000Z",
  );

  assert.equal(
    computeNextCheckoutReminderAt({
      checkinAtIso: "2026-03-16T16:00:00.000Z",
      lastReminderAtIso: "2026-03-16T17:00:00.000Z",
      intervalMinutes: 60,
    }),
    "2026-03-16T18:00:00.000Z",
  );
});

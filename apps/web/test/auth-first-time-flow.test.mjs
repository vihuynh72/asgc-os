import test from "node:test";
import assert from "node:assert/strict";

import {
  FIRST_TIME_SIGNIN_NEXT_STEP,
  buildFirstTimeVerifyResponse,
  normalizeOtpCode,
} from "../src/lib/auth/first-time-signin-flow.mjs";

test("normalizeOtpCode strips spaces and punctuation from pasted OTP codes", () => {
  assert.equal(normalizeOtpCode("246 813"), "246813");
  assert.equal(normalizeOtpCode("246-813"), "246813");
  assert.equal(normalizeOtpCode(" 2 4 6 8 1 3 "), "246813");
});

test("normalizeOtpCode keeps only the first six digits", () => {
  assert.equal(normalizeOtpCode("246813999"), "246813");
});

test("buildFirstTimeVerifyResponse returns the inline password-setup next step", () => {
  assert.deepEqual(buildFirstTimeVerifyResponse("/office-hours/kiosk"), {
    ok: true,
    nextStep: FIRST_TIME_SIGNIN_NEXT_STEP,
    redirectTo: "/office-hours/kiosk",
  });
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  validateAdminCheckoutAt,
  computeAdminOverrideMinutes,
  buildAdminOverrideNotification,
} from "../src/lib/office-hours-admin-overrides.mjs";

test("validateAdminCheckoutAt rejects times before check-in or after now", () => {
  const checkin = "2026-02-03T16:00:00.000Z";
  const now = "2026-02-03T18:00:00.000Z";

  assert.equal(
    validateAdminCheckoutAt({
      checkinAtIso: checkin,
      checkoutAtIso: "2026-02-03T15:00:00.000Z",
      nowIso: now,
    }).ok,
    false,
  );
  assert.equal(
    validateAdminCheckoutAt({
      checkinAtIso: checkin,
      checkoutAtIso: "2026-02-03T19:00:00.000Z",
      nowIso: now,
    }).ok,
    false,
  );
  assert.equal(
    validateAdminCheckoutAt({
      checkinAtIso: checkin,
      checkoutAtIso: "2026-02-03T17:30:00.000Z",
      nowIso: now,
    }).ok,
    true,
  );
});

test("computeAdminOverrideMinutes returns non-negative minutes", () => {
  const checkin = "2026-02-03T16:00:00.000Z";
  const checkout = "2026-02-03T17:05:00.000Z";

  assert.equal(computeAdminOverrideMinutes(checkin, checkout), 65);
});

test("buildAdminOverrideNotification includes reason and exclusion flag", () => {
  const result = buildAdminOverrideNotification({
    memberName: "Vi",
    checkoutAtIso: "2026-02-03T17:05:00.000Z",
    excludeFromTotals: true,
    reason: "Forgot to check out",
  });

  assert.match(result.subject, /Office hours updated/i);
  assert.match(result.text, /Forgot to check out/);
  assert.match(result.text, /Excluded from totals: yes/i);
});

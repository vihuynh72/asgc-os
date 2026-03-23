import test from "node:test";
import assert from "node:assert/strict";

import { buildMfaRecoveryEmail } from "../src/lib/auth/mfa-recovery-email.mjs";
import { buildPasswordResetEmail } from "../src/lib/auth/password-reset-email.mjs";
import { buildOfficeHoursNotificationEmail } from "../src/lib/office-hours-notification-email.mjs";
import { buildRoleUpdateEmail } from "../src/lib/role-update-email.mjs";

test("buildPasswordResetEmail formats html and text with the real reset link", () => {
  const email = buildPasswordResetEmail({
    resetLink: "https://asgc.app/auth/callback?token_hash=abc&type=recovery",
  });

  assert.equal(email.subject, "ASGC OS password reset");
  assert.match(email.text, /https:\/\/asgc\.app\/auth\/callback/);
  assert.match(email.html ?? "", /Reset your password/i);
  assert.match(email.html ?? "", /href="https:\/\/asgc\.app\/auth\/callback\?token_hash=abc&amp;type=recovery"/);
});

test("buildMfaRecoveryEmail keeps both the recovery link and one-time code visible", () => {
  const email = buildMfaRecoveryEmail({
    recoveryLink: "https://asgc.app/auth/callback?token_hash=xyz&type=recovery",
    emailOtp: "902410",
  });

  assert.equal(email.subject, "ASGC OS: recover access (reset 2FA)");
  assert.match(email.text, /902410/);
  assert.match(email.html ?? "", /902410/);
  assert.match(email.html ?? "", /Recover access/i);
});

test("buildRoleUpdateEmail renders the member-facing role update notice", () => {
  const email = buildRoleUpdateEmail({
    roleLabel: "Executive",
    termLabel: "Spring 2026",
    note: "Term closed after transition.",
  });

  assert.equal(email.subject, "ASGC OS role update");
  assert.match(email.text, /Executive/);
  assert.match(email.text, /Spring 2026/);
  assert.match(email.html ?? "", /Role updated/i);
  assert.match(email.html ?? "", /Term closed after transition/);
});

test("buildOfficeHoursNotificationEmail formats weekly reminder emails with html", () => {
  const email = buildOfficeHoursNotificationEmail({
    type: "office_hours.weekly_hours_reminder",
    origin: "https://asgc.app",
    metadata: {
      week_start: "2026-03-23",
      week_end: "2026-03-27",
      required_total_minutes: 480,
      total_minutes: 240,
      deficit_minutes: 240,
    },
  });

  assert.equal(email.subject, "Office hours reminder: hours remaining this week");
  assert.match(email.text, /4h 0m/);
  assert.match(email.html ?? "", /Hours remaining this week/i);
  assert.match(email.html ?? "", /https:\/\/asgc\.app\/office-hours/);
});

test("buildOfficeHoursNotificationEmail formats coverage notices outside the session-email helper", () => {
  const email = buildOfficeHoursNotificationEmail({
    type: "office_hours.coverage_requested",
    origin: "https://asgc.app",
    metadata: {
      starts_at_local: "2026-03-25 10:00",
      ends_at_local: "2026-03-25 12:00",
      office_tz: "America/Los_Angeles",
    },
  });

  assert.equal(email.subject, "Office hours coverage needed");
  assert.match(email.text, /2026-03-25 10:00/);
  assert.match(email.html ?? "", /coverage needed/i);
});

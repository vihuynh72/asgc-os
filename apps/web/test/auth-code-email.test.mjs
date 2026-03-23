import test from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_CODE_EMAIL_BRAND,
  FIRST_TIME_SIGNIN_CHALLENGE_KIND,
  PASSWORD_SIGNIN_CHALLENGE_KIND,
  buildAuthCodeEmail,
  buildFirstTimeSignInChallengeInsert,
} from "../src/lib/auth/auth-code-email.mjs";

test("buildAuthCodeEmail formats a branded first-time code email without any sign-in link", () => {
  const email = buildAuthCodeEmail({
    kind: FIRST_TIME_SIGNIN_CHALLENGE_KIND,
    code: "123456",
    expiresInMinutes: 10,
  });

  assert.equal(email.subject, "ASGC OS sign-in code");
  assert.match(email.text, /123456/);
  assert.match(email.text, /10 minutes/);
  assert.doesNotMatch(email.text, /https?:\/\//);
  assert.match(email.html, /ASGC OS/);
  assert.match(email.html, /123456/);
  assert.doesNotMatch(email.html, /href=/);
});

test("buildAuthCodeEmail reuses the same brand for trusted-browser verification", () => {
  const email = buildAuthCodeEmail({
    kind: PASSWORD_SIGNIN_CHALLENGE_KIND,
    code: "654321",
    expiresInMinutes: 10,
  });

  assert.equal(AUTH_CODE_EMAIL_BRAND, "ASGC OS");
  assert.equal(email.subject, "ASGC OS sign-in code");
  assert.match(email.text, /654321/);
  assert.match(email.text, /verify this browser/i);
  assert.match(email.html, /Verify this browser/i);
});

test("buildFirstTimeSignInChallengeInsert stores the app-managed code and hidden Supabase verification data", () => {
  const insert = buildFirstTimeSignInChallengeInsert({
    challengeId: "challenge-123",
    userId: "user-123",
    email: "member@gcccd.edu",
    code: "123456",
    redirectTo: "/office-hours/kiosk",
    requestIp: "203.0.113.10",
    userAgent: "Unit Test Browser",
    expiresAt: "2026-03-22T18:10:00.000Z",
    supabaseTokenHash: "hashed-token-123",
    supabaseVerificationType: "magiclink",
    secret: "server-secret-1234567890",
  });

  assert.equal(insert.id, "challenge-123");
  assert.equal(insert.user_id, "user-123");
  assert.equal(insert.email, "member@gcccd.edu");
  assert.equal(insert.challenge_kind, FIRST_TIME_SIGNIN_CHALLENGE_KIND);
  assert.equal(insert.redirect_to, "/office-hours/kiosk");
  assert.equal(insert.request_ip, "203.0.113.10");
  assert.equal(insert.user_agent, "Unit Test Browser");
  assert.equal(insert.expires_at, "2026-03-22T18:10:00.000Z");
  assert.equal(insert.supabase_token_hash, "hashed-token-123");
  assert.equal(insert.supabase_verification_type, "magiclink");
  assert.notEqual(insert.code_hash, "123456");
});

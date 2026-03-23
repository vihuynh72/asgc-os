import test from "node:test";
import assert from "node:assert/strict";

import {
  PENDING_PASSWORD_LOGIN_COOKIE,
  buildLoginEmailChallengeExpiry,
  hashLoginEmailChallengeCode,
  readPendingPasswordLogin,
  sealPendingPasswordLogin,
  verifyLoginEmailChallengeCode,
} from "../src/lib/auth/password-signin.mjs";
import {
  TRUSTED_DEVICE_COOKIE,
  buildTrustedDeviceExpiry,
  hashTrustedDeviceToken,
  verifyTrustedDeviceToken,
} from "../src/lib/auth/trusted-device.mjs";

test("trusted device token hashing is deterministic and safe to verify", () => {
  const hash = hashTrustedDeviceToken({
    token: "device-token-123",
    secret: "server-secret-1234567890",
  });

  assert.equal(
    verifyTrustedDeviceToken({
      token: "device-token-123",
      hash,
      secret: "server-secret-1234567890",
    }),
    true,
  );

  assert.equal(
    verifyTrustedDeviceToken({
      token: "different-token",
      hash,
      secret: "server-secret-1234567890",
    }),
    false,
  );
});

test("login email challenge hashes are bound to challenge id and secret", () => {
  const hash = hashLoginEmailChallengeCode({
    challengeId: "challenge-1",
    code: "123456",
    secret: "server-secret-1234567890",
  });

  assert.equal(
    verifyLoginEmailChallengeCode({
      challengeId: "challenge-1",
      code: "123456",
      hash,
      secret: "server-secret-1234567890",
    }),
    true,
  );

  assert.equal(
    verifyLoginEmailChallengeCode({
      challengeId: "challenge-2",
      code: "123456",
      hash,
      secret: "server-secret-1234567890",
    }),
    false,
  );
});

test("pending password login payloads round-trip through the sealed cookie", () => {
  const sealed = sealPendingPasswordLogin({
    payload: {
      challengeId: "challenge-1",
      userId: "user-1",
      email: "member@gcccd.edu",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      redirectTo: "/office-hours",
    },
    secret: "server-secret-1234567890",
  });

  const parsed = readPendingPasswordLogin({
    value: sealed,
    secret: "server-secret-1234567890",
  });

  assert.deepEqual(parsed, {
    challengeId: "challenge-1",
    userId: "user-1",
    email: "member@gcccd.edu",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    redirectTo: "/office-hours",
  });
});

test("pending password login payloads reject tampering", () => {
  const sealed = sealPendingPasswordLogin({
    payload: {
      challengeId: "challenge-1",
      userId: "user-1",
      email: "member@gcccd.edu",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      redirectTo: "/office-hours",
    },
    secret: "server-secret-1234567890",
  });

  const tampered = `${sealed.slice(0, -2)}aa`;

  assert.equal(
    readPendingPasswordLogin({
      value: tampered,
      secret: "server-secret-1234567890",
    }),
    null,
  );
});

test("expiry helpers keep the new auth flow on fixed windows", () => {
  const now = new Date("2026-03-22T18:00:00.000Z");

  assert.equal(buildLoginEmailChallengeExpiry(now), "2026-03-22T18:10:00.000Z");
  assert.equal(buildTrustedDeviceExpiry(now), "2026-04-21T18:00:00.000Z");
});

test("auth cookies keep the expected names", () => {
  assert.equal(PENDING_PASSWORD_LOGIN_COOKIE, "asgc.pendingPasswordLogin");
  assert.equal(TRUSTED_DEVICE_COOKIE, "asgc.trustedDevice");
});

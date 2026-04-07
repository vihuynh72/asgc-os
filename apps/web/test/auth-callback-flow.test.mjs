import test from "node:test";
import assert from "node:assert/strict";

import { finalizeVerifiedAuthCallback } from "../src/lib/auth/auth-callback.mjs";

test("ordinary recovery success routes into password setup and clears MFA recovery state", () => {
  assert.deepEqual(
    finalizeVerifiedAuthCallback({
      type: "recovery",
      redirectTo: "/office-hours/kiosk",
      inviteOk: true,
    }),
    {
      location: "/password/setup?mode=reset&redirectTo=%2Foffice-hours%2Fkiosk",
      issueMfaRecoveryCookie: false,
      clearMfaRecoveryCookie: true,
    },
  );
});

test("MFA recovery success keeps the MFA recovery redirect and issues the recovery cookie", () => {
  assert.deepEqual(
    finalizeVerifiedAuthCallback({
      type: "recovery",
      redirectTo: "/mfa/recover?redirectTo=%2Faccount",
      inviteOk: true,
    }),
    {
      location: "/mfa/recover?redirectTo=%2Faccount",
      issueMfaRecoveryCookie: true,
      clearMfaRecoveryCookie: false,
    },
  );
});

test("invite-only failure after recovery verification does not rewrite the response back into recovery", () => {
  assert.deepEqual(
    finalizeVerifiedAuthCallback({
      type: "recovery",
      redirectTo: "/dashboard",
      inviteOk: false,
    }),
    {
      location: null,
      issueMfaRecoveryCookie: false,
      clearMfaRecoveryCookie: true,
    },
  );
});

test("non-recovery verified callbacks clear stale MFA recovery state", () => {
  assert.deepEqual(
    finalizeVerifiedAuthCallback({
      type: "magiclink",
      redirectTo: "/dashboard",
      inviteOk: true,
    }),
    {
      location: null,
      issueMfaRecoveryCookie: false,
      clearMfaRecoveryCookie: true,
    },
  );
});

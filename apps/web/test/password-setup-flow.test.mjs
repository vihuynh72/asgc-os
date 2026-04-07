import test from "node:test";
import assert from "node:assert/strict";

import {
  PASSWORD_SETUP_PATH,
  buildPasswordSetupSuccessPayload,
  buildPasswordResetCallbackUrl,
  buildPasswordResetLink,
  buildPasswordSetupRecoveryHref,
  buildPasswordSetupHref,
  getPasswordSetupFailureMessage,
  getPasswordSetupWarningMessage,
  normalizePasswordSetupMode,
  resolveRecoveryCallbackTarget,
} from "../src/lib/auth/password-setup.mjs";

test("buildPasswordSetupHref uses the canonical setup route and preserves safe redirects", () => {
  assert.equal(
    buildPasswordSetupHref({ mode: "first_time", redirectTo: "/office-hours/kiosk?step=otp" }),
    `${PASSWORD_SETUP_PATH}?mode=first_time&redirectTo=%2Foffice-hours%2Fkiosk%3Fstep%3Dotp`,
  );
});

test("buildPasswordSetupHref sanitizes invalid input", () => {
  assert.equal(normalizePasswordSetupMode("unknown"), "first_time");
  assert.equal(
    buildPasswordSetupHref({ mode: "reset", redirectTo: "https://evil.example/reset" }),
    `${PASSWORD_SETUP_PATH}?mode=reset&redirectTo=%2Fdashboard`,
  );
});

test("resolveRecoveryCallbackTarget keeps MFA recovery links on the MFA recovery route", () => {
  assert.deepEqual(resolveRecoveryCallbackTarget("/mfa/recover?redirectTo=%2Faccount"), {
    location: "/mfa/recover?redirectTo=%2Faccount",
    issueMfaRecoveryCookie: true,
  });
});

test("resolveRecoveryCallbackTarget routes ordinary recovery links into password reset setup", () => {
  assert.deepEqual(resolveRecoveryCallbackTarget("/office-hours/kiosk"), {
    location: `${PASSWORD_SETUP_PATH}?mode=reset&redirectTo=%2Foffice-hours%2Fkiosk`,
    issueMfaRecoveryCookie: false,
  });
});

test("buildPasswordResetCallbackUrl preserves the intended safe post-auth target", () => {
  assert.equal(
    buildPasswordResetCallbackUrl({ origin: "https://asgc.app", redirectTo: "/office-hours/kiosk" }),
    "https://asgc.app/auth/callback?redirectTo=%2Foffice-hours%2Fkiosk",
  );
});

test("buildPasswordResetLink embeds Supabase recovery data on top of the callback target", () => {
  assert.equal(
    buildPasswordResetLink({
      origin: "https://asgc.app",
      redirectTo: "/dashboard",
      tokenHash: "hashed-token",
      verificationType: "recovery",
    }),
    "https://asgc.app/auth/callback?redirectTo=%2Fdashboard&token_hash=hashed-token&type=recovery",
  );
});

test("buildPasswordSetupRecoveryHref routes expired setup sessions back to login with the final target", () => {
  assert.equal(
    buildPasswordSetupRecoveryHref({ mode: "reset", redirectTo: "/office-hours/kiosk", reason: "missing_session" }),
    "/login?error=password_setup_session_expired&redirectTo=%2Foffice-hours%2Fkiosk",
  );
  assert.equal(
    buildPasswordSetupRecoveryHref({ mode: "first_time", redirectTo: "/dashboard", reason: "missing_session" }),
    "/login?error=password_setup_session_expired&redirectTo=%2Fdashboard",
  );
  assert.equal(
    buildPasswordSetupRecoveryHref({ mode: "reset", redirectTo: "/dashboard", reason: "password_update_failed" }),
    null,
  );
});

test("getPasswordSetupFailureMessage maps missing sessions to actionable copy", () => {
  assert.equal(
    getPasswordSetupFailureMessage("missing_session"),
    "Your sign-in session expired before the password could be saved. Reload this page and try again.",
  );
  assert.equal(
    getPasswordSetupFailureMessage("password_update_failed"),
    "Could not save your password. Try again.",
  );
});

test("buildPasswordSetupSuccessPayload exposes degraded success when profile sync fails", () => {
  assert.deepEqual(buildPasswordSetupSuccessPayload({ redirectTo: "/dashboard" }), {
    ok: true,
    redirectTo: "/dashboard",
  });

  assert.deepEqual(
    buildPasswordSetupSuccessPayload({
      redirectTo: "/office-hours/kiosk",
      warningReason: "profile_sync_failed",
    }),
    {
      ok: true,
      redirectTo: "/office-hours/kiosk",
      warningReason: "profile_sync_failed",
    },
  );
});

test("getPasswordSetupWarningMessage maps degraded profile sync success to non-blocking copy", () => {
  assert.equal(
    getPasswordSetupWarningMessage("profile_sync_failed"),
    "Password changed. Your account setup status is still syncing, but you can continue.",
  );
  assert.equal(getPasswordSetupWarningMessage(undefined), null);
});

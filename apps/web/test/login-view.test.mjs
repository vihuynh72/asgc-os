import test from "node:test";
import assert from "node:assert/strict";

import {
  getLoginCallbackErrorNotice,
  getLoginModeContent,
  getLoginPrimaryActionLabel,
  getLoginStatusNotice,
  getLoginVerifyNotice,
} from "../src/lib/login-view.mjs";

test("getLoginModeContent keeps mode copy compact", () => {
  assert.deepEqual(getLoginModeContent("email"), {
    label: "Email",
    eyebrow: "Email code",
    title: "Campus email first",
    detail: "Code only. No sign-in link.",
  });

  assert.deepEqual(getLoginModeContent("password"), {
    label: "Password",
    eyebrow: "Password",
    title: "Use your password",
    detail: "Reset it if needed.",
  });
});

test("getLoginPrimaryActionLabel matches auth mode and loading state", () => {
  assert.equal(
    getLoginPrimaryActionLabel({ authMode: "email", isSubmitting: false, isSigningIn: false }),
    "Send code",
  );
  assert.equal(
    getLoginPrimaryActionLabel({ authMode: "email", isSubmitting: true, isSigningIn: false }),
    "Sending...",
  );
  assert.equal(
    getLoginPrimaryActionLabel({ authMode: "password", isSubmitting: false, isSigningIn: false }),
    "Sign in",
  );
  assert.equal(
    getLoginPrimaryActionLabel({ authMode: "password", isSubmitting: false, isSigningIn: true }),
    "Signing in...",
  );
});

test("getLoginStatusNotice returns concise tone-aware copy", () => {
  assert.deepEqual(
    getLoginStatusNotice({ authMode: "email", status: "sent", passwordStatus: "idle", resetStatus: "idle" }),
    { tone: "good", message: "Code sent. Check your email and enter it below." },
  );

  assert.deepEqual(
    getLoginStatusNotice({ authMode: "email", status: "error", passwordStatus: "idle", resetStatus: "idle" }),
    { tone: "critical", message: "Could not send the sign-in email. Try again." },
  );

  assert.deepEqual(
    getLoginStatusNotice({ authMode: "password", status: "idle", passwordStatus: "error", resetStatus: "idle" }),
    { tone: "critical", message: "Sign-in failed. Check your email or password." },
  );

  assert.deepEqual(
    getLoginStatusNotice({ authMode: "password", status: "idle", passwordStatus: "idle", resetStatus: "sent" }),
    { tone: "good", message: "If invited, a reset email is on the way." },
  );
});

test("getLoginVerifyNotice handles verification failures", () => {
  assert.equal(getLoginVerifyNotice("idle"), null);
  assert.deepEqual(
    getLoginVerifyNotice("error"),
    { tone: "critical", message: "That code could not be verified. Request a new one." },
  );
});

test("getLoginCallbackErrorNotice maps password setup recovery back into login copy", () => {
  assert.deepEqual(
    getLoginCallbackErrorNotice("password_setup_session_expired"),
    {
      tone: "critical",
      message: "Your password setup session expired. Start sign-in again or request a new reset email.",
    },
  );
  assert.equal(getLoginCallbackErrorNotice("unknown"), null);
});

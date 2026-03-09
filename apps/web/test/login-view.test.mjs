import test from "node:test";
import assert from "node:assert/strict";

import {
  getLoginModeContent,
  getLoginPrimaryActionLabel,
  getLoginStatusNotice,
  getLoginVerifyNotice,
} from "../src/lib/login-view.mjs";

test("getLoginModeContent keeps mode copy compact", () => {
  assert.deepEqual(getLoginModeContent("email"), {
    label: "Email",
    eyebrow: "Magic link",
    title: "Campus email first",
    detail: "Link or one-time code.",
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
    "Send link",
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
    { tone: "good", message: "Link sent. You can also enter the code below." },
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

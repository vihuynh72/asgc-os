import test from "node:test";
import assert from "node:assert/strict";

import { deriveLoginHydrationState } from "../src/lib/auth/login-hydration-state.mjs";

test("deriveLoginHydrationState keeps signed-out users on the password panel", () => {
  assert.deepEqual(deriveLoginHydrationState({ user: null, passwordReadyState: "missing" }), {
    existingUser: null,
    panelMode: "password",
    passwordSetupRequired: false,
  });
});

test("deriveLoginHydrationState keeps password-ready users on the normal signed-in state", () => {
  assert.deepEqual(
    deriveLoginHydrationState({
      user: { email: "member@gcccd.edu" },
      passwordReadyState: "ready",
    }),
    {
      existingUser: { email: "member@gcccd.edu" },
      panelMode: "password",
      passwordSetupRequired: false,
    },
  );
});

test("deriveLoginHydrationState flags signed-in users without password_ready_at for setup redirect", () => {
  assert.deepEqual(
    deriveLoginHydrationState({
      user: { email: "member@gcccd.edu" },
      passwordReadyState: "missing",
    }),
    {
      existingUser: { email: "member@gcccd.edu" },
      panelMode: "password",
      passwordSetupRequired: true,
    },
  );
});

test("deriveLoginHydrationState fails open when password readiness is temporarily unknown", () => {
  assert.deepEqual(
    deriveLoginHydrationState({
      user: { email: "member@gcccd.edu" },
      passwordReadyState: "unknown",
    }),
    {
      existingUser: { email: "member@gcccd.edu" },
      panelMode: "password",
      passwordSetupRequired: false,
    },
  );
});

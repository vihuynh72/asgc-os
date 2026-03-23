import test from "node:test";
import assert from "node:assert/strict";

import { deriveLoginHydrationState } from "../src/lib/auth/login-hydration-state.mjs";

test("deriveLoginHydrationState keeps signed-out users on the password panel", () => {
  assert.deepEqual(deriveLoginHydrationState({ user: null, passwordReadyAt: null }), {
    existingUser: null,
    panelMode: "password",
  });
});

test("deriveLoginHydrationState keeps password-ready users on the normal signed-in state", () => {
  assert.deepEqual(
    deriveLoginHydrationState({
      user: { email: "member@gcccd.edu" },
      passwordReadyAt: "2026-03-23T12:00:00.000Z",
    }),
    {
      existingUser: { email: "member@gcccd.edu" },
      panelMode: "password",
    },
  );
});

test("deriveLoginHydrationState routes signed-in users without password_ready_at into password creation", () => {
  assert.deepEqual(
    deriveLoginHydrationState({
      user: { email: "member@gcccd.edu" },
      passwordReadyAt: null,
    }),
    {
      existingUser: { email: "member@gcccd.edu" },
      panelMode: "first_time_password",
    },
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import { resolvePasswordReadyState } from "../src/lib/auth/password-ready-state.mjs";

test("password-ready state is ready when the durable profile flag exists", () => {
  assert.deepEqual(
    resolvePasswordReadyState({
      passwordReadyAt: "2026-04-06T18:00:00.000Z",
      passwordReadyBypassUntil: null,
      lookupError: null,
      now: "2026-04-06T18:05:00.000Z",
    }),
    {
      status: "ready",
      source: "profile",
    },
  );
});

test("password-ready state is ready when the temporary bypass is still valid", () => {
  assert.deepEqual(
    resolvePasswordReadyState({
      passwordReadyAt: null,
      passwordReadyBypassUntil: "2026-04-07T10:00:00.000Z",
      lookupError: null,
      now: "2026-04-06T18:05:00.000Z",
    }),
    {
      status: "ready",
      source: "bypass",
    },
  );
});

test("password-ready state is missing when lookup succeeds without a flag or bypass", () => {
  assert.deepEqual(
    resolvePasswordReadyState({
      passwordReadyAt: null,
      passwordReadyBypassUntil: null,
      lookupError: null,
      now: "2026-04-06T18:05:00.000Z",
    }),
    {
      status: "missing",
      source: "missing",
    },
  );
});

test("password-ready state is unknown when the profile lookup errors", () => {
  assert.deepEqual(
    resolvePasswordReadyState({
      passwordReadyAt: null,
      passwordReadyBypassUntil: null,
      lookupError: new Error("profile read failed"),
      now: "2026-04-06T18:05:00.000Z",
    }),
    {
      status: "unknown",
      source: "lookup_error",
    },
  );
});

test("password-ready bypass expires exactly at its deadline", () => {
  assert.deepEqual(
    resolvePasswordReadyState({
      passwordReadyAt: null,
      passwordReadyBypassUntil: "2026-04-06T18:05:00.000Z",
      lookupError: null,
      now: "2026-04-06T18:05:00.000Z",
    }),
    {
      status: "missing",
      source: "missing",
    },
  );
});

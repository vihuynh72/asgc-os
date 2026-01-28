import test from "node:test";
import assert from "node:assert/strict";

import { isAuthorizedCronRequest } from "../src/lib/cron-auth.mjs";

test("isAuthorizedCronRequest accepts matching Bearer token", () => {
  assert.equal(
    isAuthorizedCronRequest({ authorization: "Bearer abc123" }, { cronSecret: "abc123" }),
    true
  );
});

test("isAuthorizedCronRequest accepts Bearer token with whitespace", () => {
  assert.equal(
    isAuthorizedCronRequest({ authorization: "  Bearer   abc123  " }, { cronSecret: " abc123\n" }),
    true
  );
});

test("isAuthorizedCronRequest rejects mismatched Bearer token", () => {
  assert.equal(
    isAuthorizedCronRequest({ authorization: "Bearer wrong" }, { cronSecret: "abc123" }),
    false
  );
});

test("isAuthorizedCronRequest accepts matching legacy x-cron-secret", () => {
  assert.equal(
    isAuthorizedCronRequest({ "x-cron-secret": "abc123" }, { cronSecret: "abc123" }),
    true
  );
});

test("isAuthorizedCronRequest rejects missing headers", () => {
  assert.equal(isAuthorizedCronRequest({}, { cronSecret: "abc123" }), false);
});

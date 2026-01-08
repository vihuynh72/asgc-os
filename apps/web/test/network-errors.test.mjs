import test from "node:test";
import assert from "node:assert/strict";

import { swallowNetworkError } from "../src/lib/network-errors.mjs";

test("swallowNetworkError returns null on fetch failure", async () => {
  const result = await swallowNetworkError(async () => {
    throw new TypeError("Failed to fetch");
  });

  assert.equal(result, null);
});

test("swallowNetworkError rethrows non-network errors", async () => {
  await assert.rejects(
    () =>
      swallowNetworkError(async () => {
        throw new Error("boom");
      }),
    /boom/
  );
});


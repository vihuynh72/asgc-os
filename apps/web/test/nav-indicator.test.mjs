import test from "node:test";
import assert from "node:assert/strict";

import { getActiveNavKey } from "../src/lib/nav-indicator.mjs";

test("getActiveNavKey prefers primary match over More", () => {
  const result = getActiveNavKey("/tasks", ["/dashboard", "/tasks"], true);
  assert.equal(result, "/tasks");
});

test("getActiveNavKey falls back to More when no primary matches", () => {
  const result = getActiveNavKey("/finance", ["/dashboard", "/tasks"], true);
  assert.equal(result, "more");
});

test("getActiveNavKey returns null when no primary matches and no More", () => {
  const result = getActiveNavKey("/finance", ["/dashboard", "/tasks"], false);
  assert.equal(result, null);
});


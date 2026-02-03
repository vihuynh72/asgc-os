import test from "node:test";
import assert from "node:assert/strict";

import { shouldCloseOnBackdrop } from "../src/lib/lightbox-utils.mjs";

test("shouldCloseOnBackdrop returns true when target is currentTarget", () => {
  const target = {};
  assert.equal(shouldCloseOnBackdrop({ target, currentTarget: target }), true);
});

test("shouldCloseOnBackdrop returns true when target has backdrop dataset", () => {
  const target = { dataset: { backdrop: "true" } };
  assert.equal(shouldCloseOnBackdrop({ target, currentTarget: {} }), true);
});

test("shouldCloseOnBackdrop returns false for unrelated target", () => {
  const target = { dataset: { backdrop: "false" } };
  assert.equal(shouldCloseOnBackdrop({ target, currentTarget: {} }), false);
});

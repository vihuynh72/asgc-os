import test from "node:test";
import assert from "node:assert/strict";

import {
  coerceDefaultDesign,
  getEffectiveDesign,
  normalizeDesign,
  stripDesignParam,
} from "../src/lib/design-toggle.mjs";

test("normalizeDesign accepts v1/v2 and rejects others", () => {
  assert.equal(normalizeDesign("v1"), "v1");
  assert.equal(normalizeDesign(" v2 "), "v2");
  assert.equal(normalizeDesign("V1"), "v1");
  assert.equal(normalizeDesign("v3"), null);
  assert.equal(normalizeDesign(""), null);
  assert.equal(normalizeDesign(null), null);
});

test("coerceDefaultDesign falls back to v2", () => {
  assert.equal(coerceDefaultDesign("v1"), "v1");
  assert.equal(coerceDefaultDesign("v2"), "v2");
  assert.equal(coerceDefaultDesign("wat"), "v2");
  assert.equal(coerceDefaultDesign(""), "v2");
  assert.equal(coerceDefaultDesign(undefined), "v2");
});

test("getEffectiveDesign prefers cookie over default", () => {
  assert.equal(getEffectiveDesign({ cookieValue: "v1", defaultDesign: "v2" }), "v1");
  assert.equal(getEffectiveDesign({ cookieValue: "wat", defaultDesign: "v1" }), "v1");
  assert.equal(getEffectiveDesign({ cookieValue: null, defaultDesign: "v2" }), "v2");
});

test("stripDesignParam removes design query param", () => {
  const result = stripDesignParam("https://example.com/dashboard?design=v1&foo=bar");
  const url = new URL(result);
  assert.equal(url.pathname, "/dashboard");
  assert.equal(url.searchParams.get("foo"), "bar");
  assert.equal(url.searchParams.has("design"), false);
});


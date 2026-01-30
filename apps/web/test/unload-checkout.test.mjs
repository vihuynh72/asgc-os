import test from "node:test";
import assert from "node:assert/strict";

import { sendJsonBeacon } from "../src/lib/unload-checkout.mjs";

test("sendJsonBeacon prefers navigator.sendBeacon when available", async () => {
  let called = false;
  /** @type {string|null} */
  let seenUrl = null;
  /** @type {unknown} */
  let seenBody = null;

  const ok = await sendJsonBeacon({
    url: "/api/office-hours/check-out",
    body: { lat: 1, lon: 2 },
    sendBeacon: (url, data) => {
      called = true;
      seenUrl = url;
      seenBody = data;
      return true;
    },
  });

  assert.equal(ok, true);
  assert.equal(called, true);
  assert.equal(seenUrl, "/api/office-hours/check-out");
  assert.ok(seenBody instanceof Blob);
});

test("sendJsonBeacon falls back to fetch keepalive when sendBeacon is unavailable", async () => {
  /** @type {Array<{url: string, init: any}>} */
  const calls = [];

  const ok = await sendJsonBeacon({
    url: "/api/office-hours/check-out",
    body: { lat: 1, lon: 2 },
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return { ok: true };
    },
  });

  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/office-hours/check-out");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.keepalive, true);
  assert.equal(calls[0].init.headers["content-type"], "application/json");
});


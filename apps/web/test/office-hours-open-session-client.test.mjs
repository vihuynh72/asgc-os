import test from "node:test";
import assert from "node:assert/strict";

import { fetchLatestOwnOpenSession } from "../src/lib/office-hours-open-session-client.mjs";

function createSupabaseStub(result) {
  const calls = [];
  const chain = {
    select(columns) {
      calls.push(["select", columns]);
      return chain;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return chain;
    },
    is(column, value) {
      calls.push(["is", column, value]);
      return chain;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return chain;
    },
    limit(value) {
      calls.push(["limit", value]);
      return chain;
    },
    maybeSingle() {
      calls.push(["maybeSingle"]);
      return Promise.resolve(result);
    },
  };

  return {
    calls,
    supabase: {
      from(table) {
        calls.push(["from", table]);
        return chain;
      },
    },
  };
}

test("fetchLatestOwnOpenSession scopes the lookup to the signed-in user", async () => {
  const expected = {
    data: {
      id: "session-1",
      checkin_at: "2026-04-06T16:38:17.000Z",
    },
    error: null,
  };
  const { supabase, calls } = createSupabaseStub(expected);

  const result = await fetchLatestOwnOpenSession(supabase, "member-123", "id,checkin_at");

  assert.deepEqual(result, expected);
  assert.deepEqual(calls, [
    ["from", "office_hour_sessions"],
    ["select", "id,checkin_at"],
    ["eq", "user_id", "member-123"],
    ["eq", "status", "open"],
    ["is", "checkout_at", null],
    ["order", "checkin_at", { ascending: false }],
    ["limit", 1],
    ["maybeSingle"],
  ]);
});

test("fetchLatestOwnOpenSession preserves custom select columns for presence monitoring", async () => {
  const expected = {
    data: {
      id: "session-2",
      checkin_at: "2026-04-06T16:38:17.000Z",
      requires_presence: true,
    },
    error: null,
  };
  const { supabase, calls } = createSupabaseStub(expected);

  await fetchLatestOwnOpenSession(supabase, "member-456", "id,checkin_at,requires_presence");

  assert.equal(calls[1][1], "id,checkin_at,requires_presence");
  assert.deepEqual(calls[2], ["eq", "user_id", "member-456"]);
});

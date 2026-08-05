import test from "node:test";
import assert from "node:assert/strict";

import {
  applySupabaseResponseHeaders,
  copySupabaseResponseState,
  createSupabaseProxyResponseBuffer,
} from "../src/lib/supabase-response-headers.mjs";

function createResponseRecorder() {
  const headers = new Map();
  const cookies = new Map();

  return {
    headers: {
      set(name, value) {
        headers.set(name.toLowerCase(), value);
      },
      get(name) {
        return headers.get(name.toLowerCase()) ?? null;
      },
    },
    cookies: {
      set(nameOrCookie, value, options) {
        if (typeof nameOrCookie === "object") {
          const { name, value: cookieValue, ...cookieOptions } = nameOrCookie;
          cookies.set(name, { value: cookieValue, options: cookieOptions });
          return;
        }
        cookies.set(nameOrCookie, { value, options });
      },
      getAll() {
        return Array.from(cookies, ([name, cookie]) => ({
          name,
          value: cookie.value,
          ...(cookie.options ?? {}),
        }));
      },
    },
    recordedHeaders: headers,
    recordedCookies: cookies,
  };
}

function createRequestRecorder() {
  const cookies = new Map();

  return {
    cookies: {
      set(name, value) {
        cookies.set(name, value);
      },
    },
    recordedCookies: cookies,
  };
}

test("forwards every response header supplied by Supabase SSR", () => {
  const response = createResponseRecorder();

  applySupabaseResponseHeaders(response, {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  });

  assert.deepEqual(Object.fromEntries(response.recordedHeaders), {
    "cache-control": "private, no-cache, no-store, must-revalidate, max-age=0",
    expires: "0",
    pragma: "no-cache",
  });
});

test("copies Supabase cookie and cache state when an auth flow replaces its response", () => {
  const initialResponse = createResponseRecorder();
  const errorResponse = createResponseRecorder();
  const pendingResponse = createSupabaseProxyResponseBuffer(createRequestRecorder());

  pendingResponse.add(
    [{ name: "sb-session", value: "", options: { path: "/", maxAge: 0 } }],
    {
      "Cache-Control": "private, no-store",
      Expires: "0",
      Pragma: "no-cache",
    },
  );
  pendingResponse.applyTo(initialResponse);

  copySupabaseResponseState(initialResponse, errorResponse);

  assert.deepEqual(Object.fromEntries(errorResponse.recordedCookies), {
    "sb-session": { value: "", options: { path: "/", maxAge: 0 } },
  });
  assert.deepEqual(Object.fromEntries(errorResponse.recordedHeaders), {
    "cache-control": "private, no-store",
    expires: "0",
    pragma: "no-cache",
  });
});

test("makes refreshed cookies visible downstream and buffers the final auth response", () => {
  const request = createRequestRecorder();
  const finalResponse = createResponseRecorder();
  const pendingResponse = createSupabaseProxyResponseBuffer(request);

  pendingResponse.add(
    [{ name: "sb-session", value: "refreshed", options: { httpOnly: true } }],
    { "Cache-Control": "private, no-store" },
  );
  pendingResponse.add([], { Expires: "0", Pragma: "no-cache" });

  assert.deepEqual(Object.fromEntries(request.recordedCookies), {
    "sb-session": "refreshed",
  });
  assert.equal(finalResponse.recordedCookies.size, 0);
  assert.equal(finalResponse.recordedHeaders.size, 0);

  pendingResponse.applyTo(finalResponse);

  assert.deepEqual(Object.fromEntries(finalResponse.recordedCookies), {
    "sb-session": { value: "refreshed", options: { httpOnly: true } },
  });
  assert.deepEqual(Object.fromEntries(finalResponse.recordedHeaders), {
    "cache-control": "private, no-store",
    expires: "0",
    pragma: "no-cache",
  });
});

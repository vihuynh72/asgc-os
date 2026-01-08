import test from "node:test";
import assert from "node:assert/strict";

import { createSignedUrlWithFallback } from "../src/lib/storage-signed-url.mjs";

function makeStorage({ signedUrl, error }) {
  let called = 0;
  return {
    get calls() {
      return called;
    },
    storage: {
      from() {
        return {
          async createSignedUrl() {
            called += 1;
            if (error) return { data: null, error: { message: error } };
            return { data: signedUrl ? { signedUrl } : null, error: null };
          },
        };
      },
    },
  };
}

test("createSignedUrlWithFallback uses primary when it succeeds", async () => {
  const primary = makeStorage({ signedUrl: "https://primary.example", error: null });
  const fallback = makeStorage({ signedUrl: "https://fallback.example", error: null });

  const url = await createSignedUrlWithFallback({
    primary: primary.storage,
    fallback: fallback.storage,
    bucket: "documents",
    path: "x.pdf",
    expiresIn: 60,
  });

  assert.equal(url, "https://primary.example");
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 0);
});

test("createSignedUrlWithFallback falls back when primary errors", async () => {
  const primary = makeStorage({ signedUrl: null, error: "permission denied" });
  const fallback = makeStorage({ signedUrl: "https://fallback.example", error: null });

  const url = await createSignedUrlWithFallback({
    primary: primary.storage,
    fallback: fallback.storage,
    bucket: "documents",
    path: "x.pdf",
    expiresIn: 60,
  });

  assert.equal(url, "https://fallback.example");
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1);
});

test("createSignedUrlWithFallback returns null when both fail", async () => {
  const primary = makeStorage({ signedUrl: null, error: "permission denied" });
  const fallback = makeStorage({ signedUrl: null, error: "not found" });

  const url = await createSignedUrlWithFallback({
    primary: primary.storage,
    fallback: fallback.storage,
    bucket: "documents",
    path: "x.pdf",
    expiresIn: 60,
  });

  assert.equal(url, null);
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1);
});

test("createSignedUrlWithFallback returns null for empty path", async () => {
  const primary = makeStorage({ signedUrl: "https://primary.example", error: null });
  const fallback = makeStorage({ signedUrl: "https://fallback.example", error: null });

  const url = await createSignedUrlWithFallback({
    primary: primary.storage,
    fallback: fallback.storage,
    bucket: "documents",
    path: "",
    expiresIn: 60,
  });

  assert.equal(url, null);
  assert.equal(primary.calls, 0);
  assert.equal(fallback.calls, 0);
});


export function toJsonBlob(value) {
  return new Blob([JSON.stringify(value)], { type: "application/json" });
}

/**
 * Best-effort send for unload/pagehide contexts.
 *
 * - Prefer `navigator.sendBeacon()` (fire-and-forget, survives unload better)
 * - Fall back to `fetch(..., { keepalive: true })`
 *
 * Returns `true` if the request was queued/sent successfully.
 */
export async function sendJsonBeacon({ url, body, sendBeacon, fetchFn }) {
  const blob = toJsonBlob(body);

  if (typeof sendBeacon === "function") {
    try {
      return sendBeacon(url, blob) === true;
    } catch {
      // fall through
    }
  }

  if (typeof fetchFn === "function") {
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      return res?.ok === true;
    } catch {
      return false;
    }
  }

  return false;
}


import crypto from "node:crypto";

export const TRUSTED_DEVICE_COOKIE = "asgc.trustedDevice";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildTrustedDeviceExpiry(now = new Date(), ttlDays = 30) {
  return new Date(now.getTime() + Math.max(1, Number(ttlDays) || 0) * 24 * 60 * 60_000).toISOString();
}

export function hashTrustedDeviceToken({ token, secret }) {
  return sha256Hex(`${token}:${secret}`);
}

export function verifyTrustedDeviceToken({ token, hash, secret }) {
  const expected = hashTrustedDeviceToken({ token, secret });
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(hash ?? ""));
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

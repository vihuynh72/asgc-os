import crypto from "node:crypto";

export const PENDING_PASSWORD_LOGIN_COOKIE = "asgc.pendingPasswordLogin";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timingSafeHexEqual(expected, actual) {
  const expectedBuffer = Buffer.from(String(expected ?? ""));
  const actualBuffer = Buffer.from(String(actual ?? ""));
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function encryptionKey(secret) {
  return crypto.createHash("sha256").update(`pending-password-login:${secret}`).digest();
}

function isPendingPasswordLoginPayload(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.challengeId === "string" &&
      typeof value.userId === "string" &&
      typeof value.email === "string" &&
      typeof value.accessToken === "string" &&
      typeof value.refreshToken === "string" &&
      typeof value.redirectTo === "string",
  );
}

export function buildLoginEmailChallengeExpiry(now = new Date(), ttlMinutes = 10) {
  return new Date(now.getTime() + Math.max(1, Number(ttlMinutes) || 0) * 60_000).toISOString();
}

export function hashLoginEmailChallengeCode({ challengeId, code, secret }) {
  return sha256Hex(`${challengeId}:${code}:${secret}`);
}

export function verifyLoginEmailChallengeCode({ challengeId, code, hash, secret }) {
  const expected = hashLoginEmailChallengeCode({ challengeId, code, secret });
  return timingSafeHexEqual(expected, hash);
}

export function sealPendingPasswordLogin({ payload, secret }) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function readPendingPasswordLogin({ value, secret }) {
  try {
    const [ivB64, encryptedB64, tagB64] = String(value ?? "").split(".");
    if (!ivB64 || !encryptedB64 || !tagB64) return null;

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(secret),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    const parsed = JSON.parse(decrypted);
    return isPendingPasswordLoginPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

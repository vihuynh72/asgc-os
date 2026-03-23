import crypto from "node:crypto";

import { TRUSTED_DEVICE_COOKIE, buildTrustedDeviceExpiry, hashTrustedDeviceToken } from "./trusted-device.mjs";

export const TRUSTED_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function issueTrustedDevice({
  admin,
  response,
  userId,
  userAgent,
  secret,
}) {
  const trustedDeviceToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = buildTrustedDeviceExpiry();
  const { error } = await admin.from("trusted_login_devices").insert({
    user_id: userId,
    token_hash: hashTrustedDeviceToken({
      token: trustedDeviceToken,
      secret,
    }),
    device_label: userAgent ?? "Trusted browser",
    user_agent: userAgent,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("[auth] trusted_login_devices insert failed", { message: error.message });
    return { ok: false };
  }

  response.cookies.set(TRUSTED_DEVICE_COOKIE, trustedDeviceToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
  });

  return { ok: true };
}

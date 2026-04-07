import crypto from "node:crypto";

import { officeHoursRoleRank } from "./office-hours-roles.mjs";

function digitsOnly(raw) {
  return String(raw ?? "").replace(/\D/g, "");
}

export function normalizeKioskPhone(raw) {
  const digits = digitsOnly(raw);
  if (digits.length === 10) {
    return { e164: `+1${digits}`, last4: digits.slice(-4) };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return { e164: `+${digits}`, last4: digits.slice(-4) };
  }
  return null;
}

export function maskPhoneE164(raw) {
  const normalized = normalizeKioskPhone(raw);
  if (!normalized) return "";
  return `***-***-${normalized.last4}`;
}

function kioskRoleRank(roleKey) {
  return officeHoursRoleRank(roleKey);
}

export function sortKioskMembers(rows) {
  return [...rows].sort((a, b) => {
    const roleDelta = kioskRoleRank(a.role_key) - kioskRoleRank(b.role_key);
    if (roleDelta !== 0) return roleDelta;

    const nameA = String(a.display_name ?? "");
    const nameB = String(b.display_name ?? "");
    if (nameA !== nameB) return nameA.localeCompare(nameB);

    const titleA = String(a.display_title ?? "").toLowerCase();
    const titleB = String(b.display_title ?? "").toLowerCase();
    if (titleA !== titleB) return titleA.localeCompare(titleB);

    return String(a.user_id ?? "").localeCompare(String(b.user_id ?? ""));
  });
}

function kioskOtpPayload({ challengeId, code, secret }) {
  return `${challengeId}:${code}:${secret}`;
}

export function hashKioskOtpCode({ challengeId, code, secret }) {
  return crypto.createHash("sha256").update(kioskOtpPayload({ challengeId, code, secret })).digest("hex");
}

export function verifyKioskOtpCode({ challengeId, code, hash, secret }) {
  const expected = hashKioskOtpCode({ challengeId, code, secret });
  const expectedBuffer = Buffer.from(expected);
  const hashBuffer = Buffer.from(String(hash ?? ""));
  if (expectedBuffer.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, hashBuffer);
}

export function computeNextCheckoutReminderAt({
  checkinAtIso,
  lastReminderAtIso,
  intervalMinutes,
}) {
  const baseIso = lastReminderAtIso || checkinAtIso;
  const baseMs = Date.parse(baseIso);
  if (!Number.isFinite(baseMs)) return null;
  const intervalMs = Math.max(1, Number(intervalMinutes) || 0) * 60_000;
  return new Date(baseMs + intervalMs).toISOString();
}

import crypto from "node:crypto";
import net from "node:net";

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

export function normalizeKioskRequestIp(raw) {
  let candidate = String(raw ?? "").trim();
  if (!candidate) return null;

  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else {
    const ipv4WithPort = candidate.match(/^(.+):(\d+)$/);
    if (ipv4WithPort && net.isIP(ipv4WithPort[1]) === 4) {
      candidate = ipv4WithPort[1];
    }
  }

  const version = net.isIP(candidate);
  if (version === 4) return candidate;
  if (version !== 6) return null;

  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    return hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

export function hashKioskOtpRateLimitKey({ scope, subject, secret }) {
  const normalizedScope = String(scope ?? "").trim().toLowerCase();
  if (!new Set(["ip", "member", "phone"]).has(normalizedScope)) {
    throw new Error("invalid_otp_rate_limit_scope");
  }

  const normalizedSubject = String(subject ?? "").trim().toLowerCase() || "unknown";
  return crypto
    .createHmac("sha256", String(secret ?? ""))
    .update(`office-hours-kiosk-otp-rate-limit:v1:${normalizedScope}:${normalizedSubject}`)
    .digest("hex");
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

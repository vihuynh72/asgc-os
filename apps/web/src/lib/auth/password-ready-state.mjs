export const PASSWORD_READY_BYPASS_METADATA_KEY = "password_ready_bypass_until";
export const PASSWORD_READY_BYPASS_TTL_MS = 24 * 60 * 60 * 1000;

function asIsoDate(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export function getPasswordReadyBypassUntil(user) {
  const raw = user?.app_metadata?.[PASSWORD_READY_BYPASS_METADATA_KEY];
  return asIsoDate(raw);
}

export function buildPasswordReadyBypassUntil(nowInput) {
  const nowDate =
    nowInput instanceof Date
      ? nowInput
      : nowInput
        ? new Date(nowInput)
        : new Date();
  return new Date(nowDate.getTime() + PASSWORD_READY_BYPASS_TTL_MS).toISOString();
}

/**
 * @param {{
 *   passwordReadyAt: string | null,
 *   passwordReadyBypassUntil: string | null | undefined,
 *   lookupError?: unknown,
 *   now?: Date | string,
 * }} input
 * @returns {{
 *   status: "ready" | "missing" | "unknown",
 *   source: "profile" | "bypass" | "lookup_error" | "missing",
 * }}
 */
export function resolvePasswordReadyState({
  passwordReadyAt,
  passwordReadyBypassUntil,
  lookupError,
  now = new Date(),
}) {
  if (asIsoDate(passwordReadyAt)) {
    return {
      status: "ready",
      source: "profile",
    };
  }

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now));
  const bypassMs = Date.parse(String(passwordReadyBypassUntil ?? ""));
  if (Number.isFinite(nowMs) && Number.isFinite(bypassMs) && bypassMs > nowMs) {
    return {
      status: "ready",
      source: "bypass",
    };
  }

  if (lookupError) {
    return {
      status: "unknown",
      source: "lookup_error",
    };
  }

  return {
    status: "missing",
    source: "missing",
  };
}

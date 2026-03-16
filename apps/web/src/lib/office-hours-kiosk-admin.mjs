const KIOSK_CONFIG_KEYS = new Set([
  "kiosk_sms_enabled",
  "kiosk_otp_ttl_minutes",
  "kiosk_checkout_reminder_interval_minutes",
]);

export function isOfficeHoursKioskManagerTier(tier) {
  return tier === "full";
}

export function touchesOfficeHoursKioskSettings(body) {
  if (!body || typeof body !== "object") return false;
  return Object.keys(body).some((key) => KIOSK_CONFIG_KEYS.has(key));
}

export const OFFICE_HOURS_BASE_CONFIG_SELECT =
  "primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local,weekly_hours_reminder_enabled,weekly_hours_reminder_weekday,weekly_hours_reminder_time_local,office_hours_allow_weekends,office_hours_allowed_weekdays,office_hours_extra_allowed_dates";

export const KIOSK_CONFIG_DEFAULTS = Object.freeze({
  kiosk_sms_enabled: false,
  kiosk_otp_ttl_minutes: 5,
  kiosk_checkout_reminder_interval_minutes: 60,
});

export const OFFICE_HOURS_KIOSK_CONFIG_SELECT = `${OFFICE_HOURS_BASE_CONFIG_SELECT},kiosk_sms_enabled,kiosk_otp_ttl_minutes,kiosk_checkout_reminder_interval_minutes`;

function getErrorMessage(errorOrMessage) {
  if (typeof errorOrMessage === "string") return errorOrMessage;
  if (errorOrMessage && typeof errorOrMessage === "object" && typeof errorOrMessage.message === "string") {
    return errorOrMessage.message;
  }
  return "";
}

function hasAnyNeedle(message, needles) {
  return needles.some((needle) => message.includes(needle));
}

export function isOfficeHoursKioskSchemaError(errorOrMessage) {
  const message = getErrorMessage(errorOrMessage).toLowerCase();
  if (!message) return false;

  if (
    hasAnyNeedle(message, [
      "office_hours_kiosk_phone_allowlist",
      "office_hours_kiosk_pending_phone_allowlist",
      "office_hours_kiosk_otp_challenges",
      "enqueue_kiosk_checkout_sms_reminders",
    ])
  ) {
    return true;
  }

  if (
    hasAnyNeedle(message, ["office_config", "schema cache"]) &&
    hasAnyNeedle(message, [
      "kiosk_sms_enabled",
      "kiosk_otp_ttl_minutes",
      "kiosk_checkout_reminder_interval_minutes",
    ])
  ) {
    return true;
  }

  if (
    hasAnyNeedle(message, ["office_hour_sessions", "schema cache"]) &&
    hasAnyNeedle(message, [
      "kiosk_auth_method",
      "kiosk_phone_e164",
      "kiosk_phone_last4",
      "kiosk_otp_verified_at",
      "last_checkout_reminder_at",
      "next_checkout_reminder_at",
    ])
  ) {
    return true;
  }

  if (
    hasAnyNeedle(message, ["notification_log", "schema cache"]) &&
    hasAnyNeedle(message, ["to_phone", "channel", "provider", "provider_message_id"])
  ) {
    return true;
  }

  return false;
}

export function normalizeOfficeHoursKioskError(errorOrMessage, fallback = "unknown") {
  const message = getErrorMessage(errorOrMessage);
  if (isOfficeHoursKioskSchemaError(message)) {
    return "kiosk_setup_incomplete";
  }
  return message || fallback;
}

export function getOfficeHoursKioskSetupMessage() {
  return "Office Hours kiosk setup is incomplete. Apply Supabase migrations 202603160001_office_hours_kiosk_admin_foundation.sql and 202603160002_office_hours_kiosk_sms_phase2.sql.";
}

export function withOfficeHoursKioskConfigDefaults(row, { kioskSchemaReady = true } = {}) {
  const source = row && typeof row === "object" ? row : {};
  return {
    primary_office_location_id:
      typeof source.primary_office_location_id === "string" ? source.primary_office_location_id : "",
    quiet_hours_enabled: Boolean(source.quiet_hours_enabled),
    quiet_hours_start_local:
      typeof source.quiet_hours_start_local === "string" ? source.quiet_hours_start_local : "18:00:00",
    quiet_hours_end_local:
      typeof source.quiet_hours_end_local === "string" ? source.quiet_hours_end_local : "07:00:00",
    weekly_hours_reminder_enabled: Boolean(source.weekly_hours_reminder_enabled),
    weekly_hours_reminder_weekday:
      typeof source.weekly_hours_reminder_weekday === "number" && Number.isFinite(source.weekly_hours_reminder_weekday)
        ? source.weekly_hours_reminder_weekday
        : 5,
    weekly_hours_reminder_time_local:
      typeof source.weekly_hours_reminder_time_local === "string" ? source.weekly_hours_reminder_time_local : "12:00:00",
    office_hours_allow_weekends: Boolean(source.office_hours_allow_weekends),
    office_hours_allowed_weekdays: Array.isArray(source.office_hours_allowed_weekdays)
      ? source.office_hours_allowed_weekdays
      : [1, 2, 3, 4, 5],
    office_hours_extra_allowed_dates: Array.isArray(source.office_hours_extra_allowed_dates)
      ? source.office_hours_extra_allowed_dates
      : [],
    kiosk_sms_enabled:
      typeof source.kiosk_sms_enabled === "boolean" ? source.kiosk_sms_enabled : KIOSK_CONFIG_DEFAULTS.kiosk_sms_enabled,
    kiosk_otp_ttl_minutes:
      typeof source.kiosk_otp_ttl_minutes === "number" && Number.isFinite(source.kiosk_otp_ttl_minutes)
        ? source.kiosk_otp_ttl_minutes
        : KIOSK_CONFIG_DEFAULTS.kiosk_otp_ttl_minutes,
    kiosk_checkout_reminder_interval_minutes:
      typeof source.kiosk_checkout_reminder_interval_minutes === "number" &&
      Number.isFinite(source.kiosk_checkout_reminder_interval_minutes)
        ? source.kiosk_checkout_reminder_interval_minutes
        : KIOSK_CONFIG_DEFAULTS.kiosk_checkout_reminder_interval_minutes,
    kiosk_schema_ready: kioskSchemaReady,
  };
}

async function selectOfficeConfig(admin, selectClause, requireRow) {
  const query = admin.from("office_config").select(selectClause).eq("id", true);
  return requireRow ? query.single() : query.maybeSingle();
}

export async function getOfficeHoursConfigWithKioskFallback(admin, { requireRow = false } = {}) {
  const fullResult = await selectOfficeConfig(admin, OFFICE_HOURS_KIOSK_CONFIG_SELECT, requireRow);
  if (!fullResult.error) {
    return fullResult.data ? withOfficeHoursKioskConfigDefaults(fullResult.data, { kioskSchemaReady: true }) : null;
  }

  if (!isOfficeHoursKioskSchemaError(fullResult.error)) {
    throw new Error(normalizeOfficeHoursKioskError(fullResult.error, "office_config_missing"));
  }

  const baseResult = await selectOfficeConfig(admin, OFFICE_HOURS_BASE_CONFIG_SELECT, requireRow);
  if (baseResult.error) {
    throw new Error(normalizeOfficeHoursKioskError(baseResult.error, "office_config_missing"));
  }

  return baseResult.data ? withOfficeHoursKioskConfigDefaults(baseResult.data, { kioskSchemaReady: false }) : null;
}

export async function ensureOfficeHoursConfigWithKioskFallback(admin) {
  const existing = await getOfficeHoursConfigWithKioskFallback(admin);
  if (existing) return existing;

  const { data: office, error: officeErr } = await admin
    .from("office_locations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (officeErr) throw new Error(normalizeOfficeHoursKioskError(officeErr, "office_location_missing"));
  if (!office?.id) throw new Error("No office_locations row found");

  const { error: insertErr } = await admin.from("office_config").insert({ id: true, primary_office_location_id: office.id });
  if (insertErr) throw new Error(normalizeOfficeHoursKioskError(insertErr, "office_config_missing"));
  return getOfficeHoursConfigWithKioskFallback(admin, { requireRow: true });
}

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeOfficeHoursKioskError } from "@/lib/office-hours-kiosk-setup.mjs";

import {
  getKioskSmsConfig,
  getOpenKioskSession,
  getOfficeGeo,
  haversineMeters,
  isWeekendInTimeZone,
  markKioskChallengeUsed,
  nextCheckoutReminderAt,
} from "@/app/api/office-hours/kiosk/_kiosk";

type KioskChallenge = {
  id: string;
  user_id: string;
  phone_e164: string;
  verified_at: string | null;
};

export async function performKioskCheckIn({
  admin,
  challenge,
  lat,
  lon,
  timestamp = new Date().toISOString(),
  options,
}: {
  admin: SupabaseClient;
  challenge: KioskChallenge;
  lat: number;
  lon: number;
  timestamp?: string;
  options?: {
    recordAudit?: boolean;
    markChallengeUsed?: boolean;
  };
}) {
  const existing = await getOpenKioskSession(admin, challenge.user_id);
  if (existing?.id) {
    throw new Error("already_checked_in");
  }
  if (!challenge.verified_at) {
    throw new Error("verification_invalid");
  }

  const geo = await getOfficeGeo(admin);
  const kioskConfig = await getKioskSmsConfig(admin);
  if (!kioskConfig.schemaReady) {
    throw new Error("kiosk_setup_incomplete");
  }

  const now = new Date(timestamp);
  const { data: allowedData, error: allowedErr } = await admin.rpc("is_office_hours_day_allowed", { _ts: now.toISOString() });
  const allowed = !allowedErr ? !!allowedData : !isWeekendInTimeZone(now, geo.timezone);
  if (!allowed) {
    throw new Error("weekend_not_allowed");
  }

  const dist = haversineMeters(lat, lon, geo.lat, geo.lon);
  if (dist > geo.graceRadiusM) {
    throw new Error("outside_geofence");
  }

  const withinRadius = dist <= geo.radiusM;
  const withinGrace = dist > geo.radiusM && dist <= geo.graceRadiusM;

  const { data: session, error: insertErr } = await admin
    .from("office_hour_sessions")
    .insert({
      user_id: challenge.user_id,
      office_location_id: geo.officeLocationId,
      checkin_at: now.toISOString(),
      status: "open",
      within_radius: withinRadius,
      within_grace: withinGrace,
      distance_m_at_checkin: dist,
      needs_review: false,
      review_reason: null,
      requires_presence: false,
      last_presence_at: now.toISOString(),
      kiosk_auth_method: "sms_otp",
      kiosk_phone_e164: challenge.phone_e164,
      kiosk_phone_last4: challenge.phone_e164.slice(-4),
      kiosk_otp_verified_at: challenge.verified_at,
      last_checkout_reminder_at: null,
      next_checkout_reminder_at: nextCheckoutReminderAt(now.toISOString(), kioskConfig.reminderIntervalMinutes),
    })
    .select("id,checkin_at,office_location_id,within_radius,within_grace,distance_m_at_checkin,kiosk_phone_last4")
    .single();

  if (insertErr) {
    const msg = insertErr.code === "23505" ? "already_checked_in" : normalizeOfficeHoursKioskError(insertErr, "unknown");
    throw new Error(msg);
  }

  if (options?.markChallengeUsed !== false) {
    await markKioskChallengeUsed(admin, challenge.id);
  }

  if (options?.recordAudit !== false) {
    await admin.from("audit_log").insert({
      actor_user_id: challenge.user_id,
      action_key: "office_hours.check_in",
      target_type: "office_hour_session",
      target_id: session.id,
      metadata: {
        method: "kiosk_sms_otp",
        office_location_id: geo.officeLocationId,
        distance_m: dist,
        within_radius: withinRadius,
        within_grace: withinGrace,
        needs_review: false,
        kiosk_phone_last4: challenge.phone_e164.slice(-4),
      },
    });
  }

  return {
    session,
    geo,
    distanceM: dist,
    allowed,
  };
}

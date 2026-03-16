import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import {
  getKioskSmsConfig,
  getOpenKioskSession,
  getVerifiedKioskChallenge,
  getOfficeGeo,
  haversineMeters,
  isWeekendInTimeZone,
  markKioskChallengeUsed,
  nextCheckoutReminderAt,
} from "../_kiosk";

export const runtime = "nodejs";

const BodySchema = z.object({
  verificationToken: z.string().uuid(),
  lat: z
    .number()
    .finite()
    .refine((v) => v >= -90 && v <= 90, { message: "invalid_lat" }),
  lon: z
    .number()
    .finite()
    .refine((v) => v >= -180 && v <= 180, { message: "invalid_lon" }),
});

function mapErrorStatus(message: string): number {
  switch (message) {
    case "already_checked_in":
      return 409;
    case "verification_invalid":
    case "verification_expired":
    case "verification_used":
      return 403;
    case "outside_geofence":
    case "office_location_not_configured":
    case "office_location_missing":
    case "office_config_missing":
    case "invalid_lat":
    case "invalid_lon":
    case "weekend_not_allowed":
      return 400;
    default:
      return 500;
  }
}

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { verificationToken, lat: latParsed, lon: lonParsed } = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
    const challenge = await getVerifiedKioskChallenge(admin, verificationToken, "check_in");
    const existing = await getOpenKioskSession(admin, challenge.user_id);
    if (existing?.id) {
      return NextResponse.json({ error: "already_checked_in" }, { status: 409 });
    }

    const geo = await getOfficeGeo(admin);
    const kioskConfig = await getKioskSmsConfig(admin);
    const now = new Date();
    const { data: allowedData, error: allowedErr } = await admin.rpc("is_office_hours_day_allowed", { _ts: now.toISOString() });
    const allowed = !allowedErr ? !!allowedData : !isWeekendInTimeZone(now, geo.timezone);
    if (!allowed) {
      return NextResponse.json({ error: "weekend_not_allowed" }, { status: 400 });
    }
    const dist = haversineMeters(latParsed, lonParsed, geo.lat, geo.lon);

    if (dist > geo.graceRadiusM) {
      return NextResponse.json({ error: "outside_geofence" }, { status: 400 });
    }

    const withinRadius = dist <= geo.radiusM;
    const withinGrace = dist > geo.radiusM && dist <= geo.graceRadiusM;

    const checkinAt = new Date().toISOString();

    const { data: session, error: insertErr } = await admin
      .from("office_hour_sessions")
      .insert({
        user_id: challenge.user_id,
        office_location_id: geo.officeLocationId,
        checkin_at: checkinAt,
        status: "open",
        within_radius: withinRadius,
        within_grace: withinGrace,
        distance_m_at_checkin: dist,
        needs_review: false,
        review_reason: null,
        requires_presence: false,
        last_presence_at: checkinAt,
        kiosk_auth_method: "sms_otp",
        kiosk_phone_e164: challenge.phone_e164,
        kiosk_phone_last4: challenge.phone_e164.slice(-4),
        kiosk_otp_verified_at: challenge.verified_at,
        last_checkout_reminder_at: null,
        next_checkout_reminder_at: nextCheckoutReminderAt(checkinAt, kioskConfig.reminderIntervalMinutes),
      })
      .select("id,checkin_at,office_location_id,within_radius,within_grace,distance_m_at_checkin,kiosk_phone_last4")
      .single();

    if (insertErr) {
      const msg = insertErr.code === "23505" ? "already_checked_in" : insertErr.message || "unknown";
      return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
    }

    await markKioskChallengeUsed(admin, challenge.id);

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

    return NextResponse.json({ session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }
}

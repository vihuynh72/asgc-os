import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import {
  getAllowlistNotesForExactEmail,
  getOfficeGeo,
  getOrCreateUserIdByEmail,
  haversineMeters,
  isEmailAllowlisted,
  isWeekendInTimeZone,
  normalizeKioskEmail,
  setProfileDisplayName,
} from "../_kiosk";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email().transform(normalizeKioskEmail),
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
    case "email_not_allowed":
      return 403;
    case "already_checked_in":
      return 409;
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

  const { email, lat, lon } = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
    const allowlisted = await isEmailAllowlisted(admin, email);
    if (!allowlisted) {
      return NextResponse.json({ error: "email_not_allowed" }, { status: 403 });
    }

    const userId = await getOrCreateUserIdByEmail(admin, email);
    const allowlistNotes = await getAllowlistNotesForExactEmail(admin, email);
    await setProfileDisplayName(admin, userId, allowlistNotes);

    const { data: existing } = await admin
      .from("office_hour_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "open")
      .is("checkout_at", null)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ error: "already_checked_in" }, { status: 409 });
    }

    const geo = await getOfficeGeo(admin);
    if (isWeekendInTimeZone(new Date(), geo.timezone)) {
      return NextResponse.json({ error: "weekend_not_allowed" }, { status: 400 });
    }
    const dist = haversineMeters(lat, lon, geo.lat, geo.lon);

    if (dist > geo.graceRadiusM) {
      return NextResponse.json({ error: "outside_geofence" }, { status: 400 });
    }

    const withinRadius = dist <= geo.radiusM;
    const withinGrace = dist > geo.radiusM && dist <= geo.graceRadiusM;

    const checkinAt = new Date().toISOString();
    const { data: session, error: insertErr } = await admin
      .from("office_hour_sessions")
      .insert({
        user_id: userId,
        office_location_id: geo.officeLocationId,
        checkin_at: checkinAt,
        status: "open",
        within_radius: withinRadius,
        within_grace: withinGrace,
        distance_m_at_checkin: dist,
        needs_review: false,
        review_reason: null,
      })
      .select("id,checkin_at,office_location_id,within_radius,within_grace,distance_m_at_checkin")
      .single();

    if (insertErr) {
      const msg = insertErr.code === "23505" ? "already_checked_in" : insertErr.message || "unknown";
      return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
    }

    await admin.from("audit_log").insert({
      actor_user_id: userId,
      action_key: "office_hours.check_in",
      target_type: "office_hour_session",
      target_id: session.id,
      metadata: {
        method: "kiosk_email",
        email,
        office_location_id: geo.officeLocationId,
        distance_m: dist,
        within_radius: withinRadius,
        within_grace: withinGrace,
        needs_review: false,
      },
    });

    return NextResponse.json({ session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }
}

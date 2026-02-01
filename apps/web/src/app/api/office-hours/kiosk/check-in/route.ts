import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import {
  getAllowlistNotesForExactEmail,
  getAllowlistDecision,
  getOfficeGeo,
  getOrCreateUserIdByEmail,
  haversineMeters,
  isWeekendInTimeZone,
  normalizeKioskEmail,
  setProfileDisplayName,
} from "../_kiosk";

export const runtime = "nodejs";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_BUCKET = "office-hours-kiosk";

const FormSchema = z.object({
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
    case "photo_required":
    case "invalid_photo_type":
    case "photo_too_large":
      return 400;
    default:
      return 500;
  }
}

function extForMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const emailRaw = form.get("email");
  const latRaw = form.get("lat");
  const lonRaw = form.get("lon");
  const photoRaw = form.get("photo");

  const lat = typeof latRaw === "string" ? Number(latRaw) : NaN;
  const lon = typeof lonRaw === "string" ? Number(lonRaw) : NaN;

  const parsed = FormSchema.safeParse({
    email: typeof emailRaw === "string" ? emailRaw : "",
    lat,
    lon,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!(photoRaw instanceof File)) {
    return NextResponse.json({ error: "photo_required" }, { status: 400 });
  }

  if (photoRaw.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "photo_too_large" }, { status: 400 });
  }

  const photoMime = photoRaw.type || "";
  const ext = extForMime(photoMime);
  if (!ext) {
    return NextResponse.json({ error: "invalid_photo_type" }, { status: 400 });
  }

  const { email, lat: latParsed, lon: lonParsed } = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
    const decision = await getAllowlistDecision(admin, email);
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: 403 });
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
    const photoPath = `kiosk-checkins/${userId}/${checkinAt.replace(/[:.]/g, "-")}-${crypto.randomUUID()}.${ext}`;

    const photoBuffer = Buffer.from(await photoRaw.arrayBuffer());
    const { error: uploadErr } = await admin.storage.from(PHOTO_BUCKET).upload(photoPath, photoBuffer, {
      contentType: photoMime,
      upsert: false,
    });
    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message || "photo_upload_failed" }, { status: 500 });
    }

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
        requires_presence: false,
        last_presence_at: checkinAt,
        kiosk_checkin_photo_bucket: PHOTO_BUCKET,
        kiosk_checkin_photo_path: photoPath,
        kiosk_checkin_photo_mime: photoMime,
        kiosk_checkin_photo_uploaded_at: checkinAt,
        kiosk_checkin_photo_deleted_at: null,
      })
      .select("id,checkin_at,office_location_id,within_radius,within_grace,distance_m_at_checkin")
      .single();

    if (insertErr) {
      await admin.storage.from(PHOTO_BUCKET).remove([photoPath]).catch(() => null);
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
        kiosk_photo_bucket: PHOTO_BUCKET,
        kiosk_photo_path: photoPath,
        kiosk_photo_mime: photoMime,
      },
    });

    return NextResponse.json({ session });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }
}

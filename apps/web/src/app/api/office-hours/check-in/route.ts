import { NextResponse, type NextRequest } from "next/server";

import { getPasswordReadyBypassUntil, resolvePasswordReadyState } from "@/lib/auth/password-ready-state.mjs";
import { normalizeMemberCheckInSession } from "@/lib/office-hours-member-kiosk.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const KIOSK_PHOTO_BUCKET = "office-hours-kiosk";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function parseCoordinate(raw: FormDataEntryValue | null, min: number, max: number) {
  const value = typeof raw === "string" ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value < min || value > max) {
    return null;
  }
  return value;
}

function mapErrorStatus(message: string): number {
  switch (message) {
    case "unauthorized":
      return 401;
    case "password_setup_required":
    case "office_hours_role_required":
      return 403;
    case "already_checked_in":
      return 409;
    case "photo_required":
    case "photo_too_large":
    case "photo_type_invalid":
    case "invalid_lat":
    case "invalid_lon":
    case "location_required":
    case "outside_geofence":
    case "office_location_not_configured":
    case "office_location_missing":
    case "office_config_missing":
    case "weekend_not_allowed":
      return 400;
    default:
      return 500;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profile_private")
    .select("password_ready_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[office-hours] password readiness lookup failed during check-in", {
      message: profileError.message,
      userId: user.id,
    });
  }

  const passwordReady = resolvePasswordReadyState({
    passwordReadyAt: profile?.password_ready_at ?? null,
    passwordReadyBypassUntil: getPasswordReadyBypassUntil(user),
    lookupError: profileError,
  });

  if (passwordReady.status === "missing") {
    return NextResponse.json({ error: "password_setup_required" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const lat = parseCoordinate(formData.get("lat"), -90, 90);
  const lon = parseCoordinate(formData.get("lon"), -180, 180);
  const photo = formData.get("photo");

  if (lat === null) {
    return NextResponse.json({ error: "invalid_lat" }, { status: 400 });
  }
  if (lon === null) {
    return NextResponse.json({ error: "invalid_lon" }, { status: 400 });
  }
  if (!(photo instanceof File) || photo.size <= 0) {
    return NextResponse.json({ error: "photo_required" }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "photo_too_large" }, { status: 400 });
  }
  if (!ALLOWED_PHOTO_TYPES.has(photo.type)) {
    return NextResponse.json({ error: "photo_type_invalid" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("check_in_office_hours", { _lat: lat, _lon: lon });

  if (error) {
    const msg = error.message || "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }

  const session = normalizeMemberCheckInSession(data);
  if (!session) {
    return NextResponse.json({ error: "invalid_session" }, { status: 500 });
  }

  const admin = getSupabaseAdminClient();
  const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
  const stamp = String(session.checkin_at).replace(/[:.]/g, "-");
  const photoPath = `member-selfies/${user.id}/${stamp}-${session.id}.${ext}`;

  const photoBuffer = Buffer.from(await photo.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(KIOSK_PHOTO_BUCKET).upload(photoPath, photoBuffer, {
    contentType: photo.type,
    upsert: false,
  });

  if (uploadError) {
    await admin.from("office_hour_sessions").delete().eq("id", session.id).eq("user_id", user.id);
    return NextResponse.json({ error: "photo_upload_failed" }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("office_hour_sessions")
    .update({
      kiosk_auth_method: "selfie",
      kiosk_checkin_photo_bucket: KIOSK_PHOTO_BUCKET,
      kiosk_checkin_photo_path: photoPath,
      kiosk_checkin_photo_mime: photo.type,
      kiosk_checkin_photo_deleted_at: null,
    })
    .eq("id", session.id)
    .eq("user_id", user.id);

  if (updateError) {
    await admin.storage.from(KIOSK_PHOTO_BUCKET).remove([photoPath]).catch(() => null);
    await admin.from("office_hour_sessions").delete().eq("id", session.id).eq("user_id", user.id);
    return NextResponse.json({ error: "photo_update_failed" }, { status: 500 });
  }

  return NextResponse.json({ session });
}

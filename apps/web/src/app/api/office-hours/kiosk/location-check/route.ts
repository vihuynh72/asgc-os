import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { shapeLocationCheckResult } from "@/lib/office-hours-kiosk/location-check.mjs";

import {
  getVerifiedKioskChallenge,
  getOfficeGeo,
  haversineMeters,
  isWeekendInTimeZone,
} from "../_kiosk";

export const runtime = "nodejs";

const BodySchema = z.object({
  verificationToken: z.string().uuid(),
  lat: z.number().finite().refine((v) => v >= -90 && v <= 90, { message: "invalid_lat" }),
  lon: z.number().finite().refine((v) => v >= -180 && v <= 180, { message: "invalid_lon" }),
});

function mapStatusLabel(message: string): string {
  switch (message) {
    case "office_location_not_configured":
    case "office_location_missing":
    case "office_config_missing":
      return "Location unavailable";
    case "invalid_lat":
    case "invalid_lon":
      return "Location invalid";
    default:
      return "Location unavailable";
  }
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { verificationToken, lat, lon } = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
    await getVerifiedKioskChallenge(admin, verificationToken, "check_in");
    const geo = await getOfficeGeo(admin);
    const distanceM = haversineMeters(lat, lon, geo.lat, geo.lon);

    const now = new Date();
    const { data: allowedData, error: allowedErr } = await admin.rpc("is_office_hours_day_allowed", {
      _ts: now.toISOString(),
    });
    const dayAllowed = !allowedErr ? Boolean(allowedData) : !isWeekendInTimeZone(now, geo.timezone);

    return NextResponse.json(
      shapeLocationCheckResult({
        decision: { allowed: true },
        dayAllowed,
        distanceM,
        radiusM: geo.radiusM,
        graceRadiusM: geo.graceRadiusM,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({
      ok: false,
      decision: { allowed: true },
      dayAllowed: false,
      distanceM: 0,
      radiusM: 0,
      graceRadiusM: 0,
      band: "outside_grace",
      statusTone: "critical",
      statusLabel: mapStatusLabel(msg),
      error: msg,
    }, { status: 400 });
  }
}

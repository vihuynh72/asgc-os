import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { getOfficeGeo, haversineMeters, isWeekendInTimeZone } from "../_kiosk";

export const runtime = "nodejs";

const BodySchema = z.object({
  action: z.enum(["check_in", "check_out"]),
  lat: z
    .number()
    .finite()
    .refine((v) => v >= -90 && v <= 90, { message: "invalid_lat" }),
  lon: z
    .number()
    .finite()
    .refine((v) => v >= -180 && v <= 180, { message: "invalid_lon" }),
});

function randomToken(): string {
  // 32 bytes -> base64url without padding; safe for URLs.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

function mapErrorStatus(message: string): number {
  switch (message) {
    case "invalid_lat":
    case "invalid_lon":
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
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { action, lat, lon } = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
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

    const token = randomToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30_000); // 30s TTL

    const { error: insertErr } = await admin.from("office_hour_kiosk_tokens").insert({
      token,
      action,
      office_location_id: geo.officeLocationId,
      distance_m: dist,
      within_radius: withinRadius,
      within_grace: withinGrace,
      expires_at: expiresAt.toISOString(),
    });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message || "token_issue_failed" }, { status: 500 });
    }

    const origin = new URL(request.url).origin;
    const url = `${origin}/office-hours/scan?token=${encodeURIComponent(token)}`;

    return NextResponse.json(
      {
        token,
        action,
        expires_at: expiresAt.toISOString(),
        url,
      },
      { status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }
}


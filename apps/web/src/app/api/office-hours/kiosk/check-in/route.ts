import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { performKioskCheckIn } from "@/lib/office-hours-kiosk-check-in";
import { normalizeOfficeHoursKioskError } from "@/lib/office-hours-kiosk-setup.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import {
  getVerifiedKioskChallenge,
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
    case "office_hours_role_required":
      return 403;
    case "outside_geofence":
    case "office_location_not_configured":
    case "office_location_missing":
    case "office_config_missing":
    case "invalid_lat":
    case "invalid_lon":
    case "weekend_not_allowed":
      return 400;
    case "kiosk_setup_incomplete":
      return 503;
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
    const { session } = await performKioskCheckIn({
      admin,
      challenge,
      lat: latParsed,
      lon: lonParsed,
    });

    return NextResponse.json({ session });
  } catch (e) {
    const msg = normalizeOfficeHoursKioskError(e, "unknown");
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }
}

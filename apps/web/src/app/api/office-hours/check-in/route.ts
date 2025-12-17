import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";

export const runtime = "nodejs";

function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op: API responses don't need to refresh auth cookies.
      },
    },
  });
}

const BodySchema = z.object({
  lat: z.number().finite(),
  lon: z.number().finite(),
  pin: z.string().trim().min(1),
});

function mapErrorStatus(message: string): number {
  switch (message) {
    case "unauthorized":
      return 401;
    case "already_checked_in":
      return 409;
    case "invalid_pin":
    case "pin_required":
    case "location_required":
    case "outside_geofence":
    case "office_location_not_configured":
    case "office_location_missing":
    case "office_config_missing":
      return 400;
    default:
      return 500;
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { lat, lon, pin } = parsed.data;

  const { data, error } = await supabase.rpc("check_in_office_hours", {
    _lat: lat,
    _lon: lon,
    _pin: pin,
  });

  if (error) {
    const msg = error.message || "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }

  const session = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ session });
}

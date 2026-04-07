import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPasswordReadyBypassUntil, resolvePasswordReadyState } from "@/lib/auth/password-ready-state.mjs";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    lat: z.number().finite().optional(),
    lon: z.number().finite().optional(),
  })
  .refine((v) => (v.lat === undefined && v.lon === undefined) || (typeof v.lat === "number" && typeof v.lon === "number"), {
    message: "location_incomplete",
  });

function mapErrorStatus(message: string): number {
  switch (message) {
    case "unauthorized":
      return 401;
    case "password_setup_required":
      return 403;
    case "no_open_session":
      return 409;
    case "location_incomplete":
    case "office_location_not_configured":
    case "office_location_missing":
    case "office_config_missing":
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
    console.error("[office-hours] password readiness lookup failed during check-out", {
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

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "invalid request";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }

  const { lat, lon } = parsed.data;

  const { data, error } = await supabase.rpc("check_out_office_hours", {
    _lat: lat ?? null,
    _lon: lon ?? null,
  });

  if (error) {
    const msg = error.message || "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }

  const session = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ session });
}

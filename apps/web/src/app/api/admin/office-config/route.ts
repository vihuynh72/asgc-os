import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type OfficeLocationRow = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  radius_m: number | null;
  grace_radius_m: number | null;
  timezone: string;
  active: boolean;
};

type OfficeConfigRow = {
  primary_office_location_id: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string;
  quiet_hours_end_local: string;
  weekly_hours_reminder_enabled: boolean;
  weekly_hours_reminder_weekday: number;
  weekly_hours_reminder_time_local: string;
};

async function isAdminForRequest(
  request: NextRequest,
): Promise<
  | { ok: true; userId: string; supabase: ReturnType<typeof createServerClient> }
  | { ok: false; response: NextResponse }
> {
  const env = getPublicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op: these admin endpoints don't need to refresh auth cookies.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, supabase };
}

function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value);
}

async function ensureOfficeConfigRow(admin: ReturnType<typeof getSupabaseAdminClient>) {
  const { data: existing, error: existingErr } = await admin
    .from("office_config")
    .select(
      "primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local,weekly_hours_reminder_enabled,weekly_hours_reminder_weekday,weekly_hours_reminder_time_local",
    )
    .eq("id", true)
    .maybeSingle();

  if (existingErr) throw new Error(existingErr.message);
  if (existing) return existing as OfficeConfigRow;

  const { data: office, error: officeErr } = await admin
    .from("office_locations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (officeErr) throw new Error(officeErr.message);
  if (!office?.id) throw new Error("No office_locations row found");

  const { data: inserted, error: insertErr } = await admin
    .from("office_config")
    .insert({ id: true, primary_office_location_id: office.id })
    .select(
      "primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local,weekly_hours_reminder_enabled,weekly_hours_reminder_weekday,weekly_hours_reminder_time_local",
    )
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return inserted as OfficeConfigRow;
}

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const admin = getSupabaseAdminClient();

  let config: OfficeConfigRow;
  try {
    config = await ensureOfficeConfigRow(admin);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load office config" }, { status: 500 });
  }

  const { data: officeLocation, error: officeErr } = await admin
    .from("office_locations")
    .select("id,name,lat,lon,radius_m,grace_radius_m,timezone,active")
    .eq("id", config.primary_office_location_id)
    .single();

  if (officeErr) {
    return NextResponse.json({ error: officeErr.message }, { status: 500 });
  }

  return NextResponse.json({
    officeConfig: config,
    officeLocation: officeLocation as OfficeLocationRow,
  });
}

export async function PUT(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const body = (await request.json().catch(() => null)) as null | Record<string, unknown>;
  if (!body) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const existing = await ensureOfficeConfigRow(admin);

  const officePatch: Record<string, unknown> = {};
  if (typeof body.name === "string") officePatch.name = body.name.trim();
  if (typeof body.timezone === "string") officePatch.timezone = body.timezone.trim();
  if (typeof body.active === "boolean") officePatch.active = body.active;

  for (const key of ["lat", "lon"] as const) {
    const v = body[key];
    if (v === null) officePatch[key] = null;
    if (typeof v === "number" && Number.isFinite(v)) officePatch[key] = v;
  }

  for (const key of ["radius_m", "grace_radius_m"] as const) {
    const v = body[key];
    if (v === null) officePatch[key] = null;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) officePatch[key] = Math.floor(v);
  }

  const configPatch: Record<string, unknown> = {};
  if (typeof body.quiet_hours_enabled === "boolean") configPatch.quiet_hours_enabled = body.quiet_hours_enabled;
  if (isTimeString(body.quiet_hours_start_local)) configPatch.quiet_hours_start_local = body.quiet_hours_start_local;
  if (isTimeString(body.quiet_hours_end_local)) configPatch.quiet_hours_end_local = body.quiet_hours_end_local;
  if (typeof body.weekly_hours_reminder_enabled === "boolean") {
    configPatch.weekly_hours_reminder_enabled = body.weekly_hours_reminder_enabled;
  }
  if (typeof body.weekly_hours_reminder_weekday === "number" && Number.isFinite(body.weekly_hours_reminder_weekday)) {
    const next = Math.floor(body.weekly_hours_reminder_weekday);
    if (next >= 1 && next <= 5) configPatch.weekly_hours_reminder_weekday = next;
  }
  if (isTimeString(body.weekly_hours_reminder_time_local)) {
    configPatch.weekly_hours_reminder_time_local = body.weekly_hours_reminder_time_local;
  }

  if (Object.keys(officePatch).length > 0) {
    const { error: patchErr } = await admin.from("office_locations").update(officePatch).eq("id", existing.primary_office_location_id);
    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });

    await admin.rpc("log_event", {
      action_key: "office_location.updated",
      actor_user_id: authz.userId,
      target_type: "office_location",
      target_id: existing.primary_office_location_id,
      metadata: officePatch,
    });
  }

  if (Object.keys(configPatch).length > 0) {
    const { error: patchErr } = await admin.from("office_config").update(configPatch).eq("id", true);
    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });

    await admin.rpc("log_event", {
      action_key: "office_config.updated",
      actor_user_id: authz.userId,
      target_type: "office_config",
      target_id: "singleton",
      metadata: configPatch,
    });
  }

  const { data: config, error: configErr } = await admin
    .from("office_config")
    .select(
      "primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local,weekly_hours_reminder_enabled,weekly_hours_reminder_weekday,weekly_hours_reminder_time_local",
    )
    .eq("id", true)
    .single();

  if (configErr) return NextResponse.json({ error: configErr.message }, { status: 500 });

  const { data: officeLocation, error: officeErr } = await admin
    .from("office_locations")
    .select("id,name,lat,lon,radius_m,grace_radius_m,timezone,active")
    .eq("id", (config as OfficeConfigRow).primary_office_location_id)
    .single();

  if (officeErr) return NextResponse.json({ error: officeErr.message }, { status: 500 });

  return NextResponse.json({
    officeConfig: config as OfficeConfigRow,
    officeLocation: officeLocation as OfficeLocationRow,
  });
}

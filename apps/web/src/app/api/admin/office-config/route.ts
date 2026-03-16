import { NextResponse, type NextRequest } from "next/server";

import { requireFullAdmin, requireFullAdminOrEvp, requireAnyAdminRead } from "@/lib/adminAuth";
import {
  normalizeOfficeHoursAllowedWeekdays,
  normalizeOfficeHoursExtraAllowedDates,
} from "@/lib/office-hours-availability.mjs";
import { touchesOfficeHoursKioskSettings } from "@/lib/office-hours-kiosk-admin.mjs";
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
  office_hours_allow_weekends: boolean;
  office_hours_allowed_weekdays: number[];
  office_hours_extra_allowed_dates: string[];
  kiosk_sms_enabled: boolean;
  kiosk_otp_ttl_minutes: number;
  kiosk_checkout_reminder_interval_minutes: number;
};

function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value);
}

async function ensureOfficeConfigRow(admin: ReturnType<typeof getSupabaseAdminClient>) {
  const { data: existing, error: existingErr } = await admin
    .from("office_config")
    .select(
      "primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local,weekly_hours_reminder_enabled,weekly_hours_reminder_weekday,weekly_hours_reminder_time_local,office_hours_allow_weekends,office_hours_allowed_weekdays,office_hours_extra_allowed_dates,kiosk_sms_enabled,kiosk_otp_ttl_minutes,kiosk_checkout_reminder_interval_minutes",
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
      "primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local,weekly_hours_reminder_enabled,weekly_hours_reminder_weekday,weekly_hours_reminder_time_local,office_hours_allow_weekends,office_hours_allowed_weekdays,office_hours_extra_allowed_dates,kiosk_sms_enabled,kiosk_otp_ttl_minutes,kiosk_checkout_reminder_interval_minutes",
    )
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return inserted as OfficeConfigRow;
}

// GET: Read office config (any admin tier can read, but EVP and full admin only see the data)
export async function GET(request: NextRequest) {
  // For reading, any admin tier needs to at least see Office Hours tab
  // But office config details are only shown to full admin or EVP in UI
  // We allow read here; UI gates visibility
  const authz = await requireAnyAdminRead(request);
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

// PUT: Update office config (full admin OR EVP only)
export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as null | Record<string, unknown>;
  if (!body) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const authz = touchesOfficeHoursKioskSettings(body)
    ? await requireFullAdmin(request)
    : await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

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

  if (typeof body.office_hours_allow_weekends === "boolean") {
    configPatch.office_hours_allow_weekends = body.office_hours_allow_weekends;
  }

  if (typeof body.kiosk_sms_enabled === "boolean") {
    configPatch.kiosk_sms_enabled = body.kiosk_sms_enabled;
  }

  if (typeof body.kiosk_otp_ttl_minutes === "number" && Number.isFinite(body.kiosk_otp_ttl_minutes)) {
    const next = Math.floor(body.kiosk_otp_ttl_minutes);
    if (next >= 1 && next <= 30) configPatch.kiosk_otp_ttl_minutes = next;
  }

  if (
    typeof body.kiosk_checkout_reminder_interval_minutes === "number" &&
    Number.isFinite(body.kiosk_checkout_reminder_interval_minutes)
  ) {
    const next = Math.floor(body.kiosk_checkout_reminder_interval_minutes);
    if (next >= 15 && next <= 240) configPatch.kiosk_checkout_reminder_interval_minutes = next;
  }

  if (Array.isArray(body.office_hours_allowed_weekdays)) {
    try {
      configPatch.office_hours_allowed_weekdays = normalizeOfficeHoursAllowedWeekdays(
        body.office_hours_allowed_weekdays.map((v) => (typeof v === "number" ? v : Number.NaN)),
      );
    } catch {
      return NextResponse.json({ error: "invalid_weekdays" }, { status: 400 });
    }
  }

  if (Array.isArray(body.office_hours_extra_allowed_dates)) {
    try {
      configPatch.office_hours_extra_allowed_dates = normalizeOfficeHoursExtraAllowedDates(
        body.office_hours_extra_allowed_dates.map((v) => (typeof v === "string" ? v : "")),
      );
    } catch {
      return NextResponse.json({ error: "invalid_dates" }, { status: 400 });
    }
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
      "primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local,weekly_hours_reminder_enabled,weekly_hours_reminder_weekday,weekly_hours_reminder_time_local,office_hours_allow_weekends,office_hours_allowed_weekdays,office_hours_extra_allowed_dates,kiosk_sms_enabled,kiosk_otp_ttl_minutes,kiosk_checkout_reminder_interval_minutes",
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

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeEmail } from "@/lib/invitesAllowlist";

export type OfficeGeo = {
  officeLocationId: string;
  lat: number;
  lon: number;
  radiusM: number;
  graceRadiusM: number;
  timezone: string;
};

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return Math.round(r * c);
}

export function appendReviewReason(existing: string | null | undefined, reason: string | null): string | null {
  if (!reason) return existing ?? null;
  const prev = (existing ?? "").trim();
  if (prev.length === 0) return reason;

  const parts = prev
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.includes(reason)) return prev;
  return `${prev};${reason}`;
}

export function normalizeKioskEmail(raw: string): string {
  return normalizeEmail(raw);
}

export async function isEmailAllowlisted(admin: SupabaseClient, email: string): Promise<boolean> {
  const { data, error } = await admin.rpc("is_email_allowlisted", { _email: email });
  if (error) throw new Error(error.message || "allowlist_lookup_failed");
  return !!data;
}

export async function getAllowlistNotesForExactEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await admin
    .from("invites_allowlist")
    .select("notes")
    .eq("email_normalized", email)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || "allowlist_lookup_failed");
  const notes = typeof data?.notes === "string" ? data.notes.trim() : "";
  return notes.length > 0 ? notes : null;
}

export async function getUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await admin.from("profile_private").select("id").eq("email", email).limit(1).maybeSingle();
  if (error) throw new Error(error.message || "profile_lookup_failed");
  return data?.id ?? null;
}

export async function setProfileDisplayName(admin: SupabaseClient, userId: string, displayName: string | null) {
  const name = (displayName ?? "").trim();
  if (!name) return;
  await admin.from("profiles").update({ display_name: name }).eq("id", userId);
}

export async function getOrCreateUserIdByEmail(admin: SupabaseClient, email: string): Promise<string> {
  const existing = await getUserIdByEmail(admin, email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(error.message || "create_user_failed");
  const id = data.user?.id;
  if (!id) throw new Error("create_user_failed");

  // Best-effort: ensure profile exists (FK requirement for office_hour_sessions.user_id).
  const [{ error: profilesErr }, { error: privateErr }] = await Promise.all([
    admin.from("profiles").upsert({ id, email: null }, { onConflict: "id" }),
    admin.from("profile_private").upsert({ id, email }, { onConflict: "id" }),
  ]);
  if (profilesErr || privateErr) throw new Error(profilesErr?.message || privateErr?.message || "create_profile_failed");

  return id;
}

export async function getOfficeGeo(admin: SupabaseClient, officeIdHint?: string | null): Promise<OfficeGeo> {
  let officeLocationId = officeIdHint ?? null;

  if (!officeLocationId) {
    const { data: config, error: cfgErr } = await admin
      .from("office_config")
      .select("primary_office_location_id")
      .eq("id", true)
      .maybeSingle();

    if (cfgErr || !config?.primary_office_location_id) {
      throw new Error("office_config_missing");
    }

    officeLocationId = config.primary_office_location_id as string;
  }

  const { data: office, error: officeErr } = await admin
    .from("office_locations")
    .select("lat,lon,radius_m,grace_radius_m,active,timezone")
    .eq("id", officeLocationId)
    .maybeSingle();

  if (officeErr || !office) throw new Error("office_location_missing");
  if (!office.active) throw new Error("office_location_missing");

  if (office.lat === null || office.lon === null || office.radius_m === null || office.grace_radius_m === null) {
    throw new Error("office_location_not_configured");
  }

  return {
    officeLocationId,
    lat: office.lat,
    lon: office.lon,
    radiusM: office.radius_m,
    graceRadiusM: office.grace_radius_m,
    timezone: typeof office.timezone === "string" && office.timezone.trim() ? office.timezone : "America/Los_Angeles",
  };
}

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function isWeekendInTimeZone(date: Date, timeZone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).formatToParts(date);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const iso = WEEKDAY_MAP[weekday] ?? 0;
    return iso >= 6;
  } catch {
    return false;
  }
}

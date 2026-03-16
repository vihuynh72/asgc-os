import { randomInt, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  computeNextCheckoutReminderAt,
  hashKioskOtpCode,
  normalizeKioskPhone,
  sortKioskMembers,
  verifyKioskOtpCode,
} from "@/lib/office-hours-kiosk-auth.mjs";
import { buildKioskAdminMembers } from "@/lib/office-hours-kiosk-admin-roster.mjs";
import {
  getOfficeHoursConfigWithKioskFallback,
  isOfficeHoursKioskSchemaError,
  normalizeOfficeHoursKioskError,
} from "@/lib/office-hours-kiosk-setup.mjs";

export type KioskIntent = "check_in" | "check_out";

export type OfficeGeo = {
  officeLocationId: string;
  lat: number;
  lon: number;
  radiusM: number;
  graceRadiusM: number;
  timezone: string;
};

export type KioskMember = {
  user_id: string;
  display_name: string;
  role_key: "president" | "executive" | "board_member";
  role_label: string;
  display_title: string | null;
  phone_configured: boolean;
  phone_last4: string | null;
  phone_updated_at: string | null;
};

export type KioskAdminMember = KioskMember & {
  member_key: string;
  source_type: "user" | "bootstrap_role_grant";
  source_id: string;
  entry_status: "active" | "awaiting_sign_in";
  bootstrap_role_grant_id: string | null;
  email: string | null;
};

type OtpChallengeRow = {
  id: string;
  user_id: string;
  phone_e164: string;
  intent: KioskIntent;
  code_hash: string;
  attempt_count: number;
  send_count: number;
  expires_at: string;
  verified_at: string | null;
  verification_token: string | null;
  verification_expires_at: string | null;
  used_at: string | null;
  created_at: string;
  updated_at: string;
};

function roleRank(roleKey: string | null | undefined): number {
  switch (roleKey) {
    case "president":
      return 0;
    case "executive":
      return 1;
    case "board_member":
      return 2;
    default:
      return 9;
  }
}

function roleLabel(roleKey: "president" | "executive" | "board_member", displayTitle: string | null): string {
  if (roleKey === "president") return "President";
  if (roleKey === "executive") return displayTitle?.trim() || "Executive";
  return "Board Member";
}

function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

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

export async function getCurrentTermId(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.rpc("current_term_id");
  if (error) throw new Error(error.message || "current_term_lookup_failed");
  return typeof data === "string" && data.length > 0 ? data : null;
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

export async function getKioskSmsConfig(admin: SupabaseClient): Promise<{
  kioskSmsEnabled: boolean;
  otpTtlMinutes: number;
  reminderIntervalMinutes: number;
  schemaReady: boolean;
}> {
  const data = await getOfficeHoursConfigWithKioskFallback(admin);
  if (!data) {
    return {
      kioskSmsEnabled: false,
      otpTtlMinutes: 5,
      reminderIntervalMinutes: 60,
      schemaReady: false,
    };
  }

  return {
    kioskSmsEnabled: Boolean(data?.kiosk_sms_enabled),
    otpTtlMinutes:
      typeof data?.kiosk_otp_ttl_minutes === "number" && Number.isFinite(data.kiosk_otp_ttl_minutes)
        ? data.kiosk_otp_ttl_minutes
        : 5,
    reminderIntervalMinutes:
      typeof data?.kiosk_checkout_reminder_interval_minutes === "number" &&
      Number.isFinite(data.kiosk_checkout_reminder_interval_minutes)
        ? data.kiosk_checkout_reminder_interval_minutes
        : 60,
    schemaReady: data?.kiosk_schema_ready !== false,
  };
}

export async function listKioskMembers(admin: SupabaseClient): Promise<KioskMember[]> {
  const currentTermId = await getCurrentTermId(admin);
  if (!currentTermId) return [];

  const { data: assignmentsRaw, error: assignmentsErr } = await admin
    .from("role_assignments")
    .select("user_id,role_key,display_title")
    .eq("term_id", currentTermId)
    .is("ends_at", null)
    .in("role_key", ["president", "executive", "board_member"]);

  if (assignmentsErr) throw new Error(assignmentsErr.message || "role_assignment_lookup_failed");

  const assignments = (assignmentsRaw ?? []) as Array<{
    user_id: string;
    role_key: "president" | "executive" | "board_member";
    display_title?: string | null;
  }>;

  const assignmentByUser = new Map<string, typeof assignments[number]>();
  for (const row of assignments) {
    const existing = assignmentByUser.get(row.user_id);
    if (!existing || roleRank(row.role_key) < roleRank(existing.role_key)) {
      assignmentByUser.set(row.user_id, row);
    }
  }

  const userIds = Array.from(assignmentByUser.keys());
  if (userIds.length === 0) return [];

  const [{ data: profilesRaw, error: profilesErr }, phonesResult] = await Promise.all([
    admin.from("profiles").select("id,display_name,status").in("id", userIds).eq("status", "active"),
    admin.from("office_hours_kiosk_phone_allowlist").select("user_id,phone_last4,updated_at").in("user_id", userIds),
  ]);

  if (profilesErr) {
    throw new Error(profilesErr.message || "kiosk_member_lookup_failed");
  }

  const phonesErr = phonesResult.error;
  const phonesRaw = isOfficeHoursKioskSchemaError(phonesErr) ? [] : phonesResult.data;
  if (phonesErr && !isOfficeHoursKioskSchemaError(phonesErr)) {
    throw new Error(normalizeOfficeHoursKioskError(phonesErr, "kiosk_member_lookup_failed"));
  }

  const phoneByUserId = new Map<string, { phone_last4: string | null; updated_at: string | null }>();
  for (const row of (phonesRaw ?? []) as Array<{ user_id: string; phone_last4: string | null; updated_at: string | null }>) {
    phoneByUserId.set(row.user_id, { phone_last4: row.phone_last4 ?? null, updated_at: row.updated_at ?? null });
  }

  const members = ((profilesRaw ?? []) as Array<{ id: string; display_name: string | null }>).map((profile) => {
    const assignment = assignmentByUser.get(profile.id)!;
    const phone = phoneByUserId.get(profile.id);
    return {
      user_id: profile.id,
      display_name: (profile.display_name ?? "").trim() || "Unnamed member",
      role_key: assignment.role_key,
      role_label: roleLabel(assignment.role_key, assignment.display_title ?? null),
      display_title: assignment.display_title ?? null,
      phone_configured: Boolean(phone?.phone_last4),
      phone_last4: phone?.phone_last4 ?? null,
      phone_updated_at: phone?.updated_at ?? null,
    };
  });

  return sortKioskMembers(members) as KioskMember[];
}

export async function listKioskAdminMembers(admin: SupabaseClient): Promise<KioskAdminMember[]> {
  const activeMembers = await listKioskMembers(admin);
  const userIds = activeMembers.map((member) => member.user_id);
  const currentTermId = await getCurrentTermId(admin);

  const [
    { data: emailsRaw, error: emailsErr },
    { data: grantsRaw, error: grantsErr },
    pendingPhonesResult,
  ] = await Promise.all([
    userIds.length > 0
      ? admin.from("profile_private").select("id,email").in("id", userIds)
      : Promise.resolve({ data: [] as Array<{ id: string; email: string | null }>, error: null }),
    currentTermId
      ? admin
          .from("bootstrap_role_grants")
          .select("id,email,role_key,notes")
          .eq("term_id", currentTermId)
          .eq("is_active", true)
          .is("consumed_at", null)
          .in("role_key", ["president", "executive", "board_member"])
      : Promise.resolve({ data: [] as Array<{ id: string; email: string; role_key: string; notes: string | null }>, error: null }),
    currentTermId
      ? admin.from("office_hours_kiosk_pending_phone_allowlist").select("bootstrap_role_grant_id,phone_last4,updated_at")
      : Promise.resolve({ data: [] as Array<{ bootstrap_role_grant_id: string; phone_last4: string | null; updated_at: string | null }>, error: null }),
  ]);

  if (emailsErr || grantsErr) {
    throw new Error(emailsErr?.message || grantsErr?.message || "kiosk_admin_member_lookup_failed");
  }

  const pendingPhonesErr = pendingPhonesResult.error;
  const pendingPhonesRaw = isOfficeHoursKioskSchemaError(pendingPhonesErr) ? [] : pendingPhonesResult.data;
  if (pendingPhonesErr && !isOfficeHoursKioskSchemaError(pendingPhonesErr)) {
    throw new Error(normalizeOfficeHoursKioskError(pendingPhonesErr, "kiosk_admin_member_lookup_failed"));
  }

  const emailByUserId = new Map<string, string | null>();
  for (const row of (emailsRaw ?? []) as Array<{ id: string; email: string | null }>) {
    emailByUserId.set(row.id, row.email ?? null);
  }

  const pendingPhoneByGrantId = new Map<string, { phone_last4: string | null; updated_at: string | null }>();
  for (const row of (pendingPhonesRaw ?? []) as Array<{ bootstrap_role_grant_id: string; phone_last4: string | null; updated_at: string | null }>) {
    pendingPhoneByGrantId.set(row.bootstrap_role_grant_id, {
      phone_last4: row.phone_last4 ?? null,
      updated_at: row.updated_at ?? null,
    });
  }

  return buildKioskAdminMembers({
    activeMembers: activeMembers.map((member) => ({
      ...member,
      member_key: `user:${member.user_id}`,
      source_type: "user",
      source_id: member.user_id,
      entry_status: "active",
      bootstrap_role_grant_id: null,
      email: emailByUserId.get(member.user_id) ?? null,
    })),
    pendingGrants: ((grantsRaw ?? []) as Array<{ id: string; email: string; role_key: "president" | "executive" | "board_member"; notes: string | null }>).map((grant) => {
      const pendingPhone = pendingPhoneByGrantId.get(grant.id);
      return {
        id: grant.id,
        email: grant.email,
        role_key: grant.role_key,
        display_title: null,
        notes: grant.notes,
        phone_last4: pendingPhone?.phone_last4 ?? null,
        phone_updated_at: pendingPhone?.updated_at ?? null,
      };
    }),
  }) as KioskAdminMember[];
}

export async function getKioskMemberRole(
  admin: SupabaseClient,
  userId: string,
): Promise<{ roleKey: "president" | "executive" | "board_member"; displayTitle: string | null } | null> {
  const currentTermId = await getCurrentTermId(admin);
  if (!currentTermId) return null;

  const { data, error } = await admin
    .from("role_assignments")
    .select("role_key,display_title")
    .eq("user_id", userId)
    .eq("term_id", currentTermId)
    .is("ends_at", null)
    .in("role_key", ["president", "executive", "board_member"]);

  if (error) throw new Error(error.message || "role_assignment_lookup_failed");
  const rows = (data ?? []) as Array<{ role_key: "president" | "executive" | "board_member"; display_title: string | null }>;
  if (rows.length === 0) return null;
  rows.sort((a, b) => roleRank(a.role_key) - roleRank(b.role_key));
  return { roleKey: rows[0]!.role_key, displayTitle: rows[0]!.display_title ?? null };
}

export async function getPendingKioskGrant(
  admin: SupabaseClient,
  grantId: string,
): Promise<{ id: string; email: string; roleKey: "president" | "executive" | "board_member" } | null> {
  const currentTermId = await getCurrentTermId(admin);
  if (!currentTermId) return null;

  const { data, error } = await admin
    .from("bootstrap_role_grants")
    .select("id,email,role_key")
    .eq("id", grantId)
    .eq("term_id", currentTermId)
    .eq("is_active", true)
    .is("consumed_at", null)
    .in("role_key", ["president", "executive", "board_member"])
    .maybeSingle();

  if (error) throw new Error(error.message || "bootstrap_grant_lookup_failed");
  if (!data?.id || !data.email || !data.role_key) return null;
  return {
    id: data.id,
    email: data.email,
    roleKey: data.role_key,
  };
}

export async function getMatchedKioskPhone(
  admin: SupabaseClient,
  userId: string,
  phoneRaw: string,
): Promise<{ phoneE164: string; phoneLast4: string }> {
  const normalized = normalizeKioskPhone(phoneRaw);
  if (!normalized) throw new Error("invalid_phone");

  const eligible = await getKioskMemberRole(admin, userId);
  if (!eligible) throw new Error("member_not_found");

  const { data, error } = await admin
    .from("office_hours_kiosk_phone_allowlist")
    .select("phone_e164,phone_last4")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(normalizeOfficeHoursKioskError(error, "phone_lookup_failed"));
  if (!data?.phone_e164 || data.phone_e164 !== normalized.e164) {
    throw new Error("phone_not_allowed");
  }

  return { phoneE164: data.phone_e164, phoneLast4: data.phone_last4 ?? normalized.last4 };
}

export async function getOpenKioskSession(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("office_hour_sessions")
    .select("id,checkin_at,office_location_id")
    .eq("user_id", userId)
    .eq("status", "open")
    .is("checkout_at", null)
    .order("checkin_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message || "session_lookup_failed");
  return data;
}

export async function createOrRefreshKioskOtpChallenge(
  admin: SupabaseClient,
  {
    userId,
    phoneE164,
    intent,
    ttlMinutes,
    otpSecret,
    requestIp,
    userAgent,
  }: {
    userId: string;
    phoneE164: string;
    intent: KioskIntent;
    ttlMinutes: number;
    otpSecret: string;
    requestIp: string | null;
    userAgent: string | null;
  },
) {
  const now = new Date();
  const fifteenMinutesAgoIso = new Date(now.getTime() - 15 * 60_000).toISOString();

  const { data: recentRaw, error: recentErr } = await admin
    .from("office_hours_kiosk_otp_challenges")
    .select("id,phone_e164,intent,attempt_count,send_count,expires_at,verified_at,used_at,created_at,updated_at")
    .eq("user_id", userId)
    .eq("intent", intent)
    .gte("created_at", fifteenMinutesAgoIso)
    .order("created_at", { ascending: false });

  if (recentErr) throw new Error(normalizeOfficeHoursKioskError(recentErr, "otp_lookup_failed"));

  const recent = (recentRaw ?? []) as Array<Pick<OtpChallengeRow, "id" | "phone_e164" | "intent" | "attempt_count" | "send_count" | "expires_at" | "verified_at" | "used_at" | "created_at" | "updated_at">>;

  const totalSends = recent.reduce((sum, row) => sum + Math.max(1, Number(row.send_count) || 1), 0);
  if (totalSends >= 5) throw new Error("otp_rate_limited");

  const latest = recent.find((row) => row.used_at === null) ?? null;
  if (latest) {
    const lastSentMs = Date.parse(latest.updated_at || latest.created_at);
    if (Number.isFinite(lastSentMs) && now.getTime() - lastSentMs < 60_000) {
      throw new Error("otp_resend_too_soon");
    }
  }

  const challengeId = latest?.id ?? randomUUID();
  const code = sixDigitCode();
  const expiresAtIso = new Date(now.getTime() + Math.max(1, ttlMinutes) * 60_000).toISOString();
  const codeHash = hashKioskOtpCode({ challengeId, code, secret: otpSecret });

  if (latest) {
    const { error } = await admin
      .from("office_hours_kiosk_otp_challenges")
      .update({
        phone_e164: phoneE164,
        code_hash: codeHash,
        attempt_count: 0,
        send_count: Math.max(1, Number(latest.send_count) || 1) + 1,
        expires_at: expiresAtIso,
        verified_at: null,
        verification_token: null,
        verification_expires_at: null,
        used_at: null,
        request_ip: requestIp,
        user_agent: userAgent,
      })
      .eq("id", latest.id);

    if (error) throw new Error(normalizeOfficeHoursKioskError(error, "otp_update_failed"));
  } else {
    const { error } = await admin.from("office_hours_kiosk_otp_challenges").insert({
      id: challengeId,
      user_id: userId,
      phone_e164: phoneE164,
      intent,
      code_hash: codeHash,
      attempt_count: 0,
      send_count: 1,
      expires_at: expiresAtIso,
      request_ip: requestIp,
      user_agent: userAgent,
    });

    if (error) throw new Error(normalizeOfficeHoursKioskError(error, "otp_insert_failed"));
  }

  return { challengeId, code, expiresAtIso };
}

export async function verifyKioskOtpChallengeCode(
  admin: SupabaseClient,
  {
    challengeId,
    userId,
    phoneE164,
    intent,
    code,
    otpSecret,
  }: {
    challengeId: string;
    userId: string;
    phoneE164: string;
    intent: KioskIntent;
    code: string;
    otpSecret: string;
  },
) {
  const { data, error } = await admin
    .from("office_hours_kiosk_otp_challenges")
    .select("id,user_id,phone_e164,intent,code_hash,attempt_count,send_count,expires_at,verified_at,verification_token,verification_expires_at,used_at,created_at,updated_at")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .eq("intent", intent)
    .maybeSingle();

  if (error) throw new Error(normalizeOfficeHoursKioskError(error, "otp_lookup_failed"));
  const row = data as OtpChallengeRow | null;
  if (!row || row.used_at) throw new Error("invalid_otp");
  if (row.phone_e164 !== phoneE164) throw new Error("invalid_otp");
  if (Date.parse(row.expires_at) < Date.now()) throw new Error("otp_expired");
  if ((row.attempt_count ?? 0) >= 5) throw new Error("otp_attempt_limit");

  const matches = verifyKioskOtpCode({
    challengeId: row.id,
    code,
    hash: row.code_hash,
    secret: otpSecret,
  });

  if (!matches) {
    await admin
      .from("office_hours_kiosk_otp_challenges")
      .update({ attempt_count: (row.attempt_count ?? 0) + 1 })
      .eq("id", row.id);
    throw new Error("invalid_otp");
  }

  const verificationToken = randomUUID();
  const verificationExpiresAtIso = new Date(Date.now() + 10 * 60_000).toISOString();
  const verifiedAtIso = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("office_hours_kiosk_otp_challenges")
    .update({
      verified_at: verifiedAtIso,
      verification_token: verificationToken,
      verification_expires_at: verificationExpiresAtIso,
    })
    .eq("id", row.id);

  if (updateErr) throw new Error(normalizeOfficeHoursKioskError(updateErr, "otp_verify_failed"));

  return {
    challengeId: row.id,
    verificationToken,
    verificationExpiresAtIso,
    verifiedAtIso,
  };
}

export async function getVerifiedKioskChallenge(
  admin: SupabaseClient,
  verificationToken: string,
  expectedIntent?: KioskIntent,
) {
  const { data, error } = await admin
    .from("office_hours_kiosk_otp_challenges")
    .select("id,user_id,phone_e164,intent,verified_at,verification_token,verification_expires_at,used_at")
    .eq("verification_token", verificationToken)
    .maybeSingle();

  if (error) throw new Error(normalizeOfficeHoursKioskError(error, "verification_lookup_failed"));

  const row = data as {
    id: string;
    user_id: string;
    phone_e164: string;
    intent: KioskIntent;
    verified_at: string | null;
    verification_token: string | null;
    verification_expires_at: string | null;
    used_at: string | null;
  } | null;

  if (!row || !row.verified_at || !row.verification_expires_at) throw new Error("verification_invalid");
  if (row.used_at) throw new Error("verification_used");
  if (expectedIntent && row.intent !== expectedIntent) throw new Error("verification_invalid");
  if (Date.parse(row.verification_expires_at) < Date.now()) throw new Error("verification_expired");

  return row;
}

export async function markKioskChallengeUsed(admin: SupabaseClient, challengeId: string) {
  const { error } = await admin
    .from("office_hours_kiosk_otp_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("id", challengeId);

  if (error) throw new Error(normalizeOfficeHoursKioskError(error, "verification_consume_failed"));
}

export function nextCheckoutReminderAt(checkinAtIso: string, intervalMinutes: number): string | null {
  return computeNextCheckoutReminderAt({
    checkinAtIso,
    lastReminderAtIso: null,
    intervalMinutes,
  });
}

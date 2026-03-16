import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { normalizeDateOnlyString } from "@/lib/dateOnly";
import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const DateStringSchema = z
  .string()
  .transform((s) => normalizeDateOnlyString(s))
  .refine((s): s is string => typeof s === "string", { message: "invalid_date" });

const QuerySchema = z.object({
  startDate: DateStringSchema,
  endDate: DateStringSchema,
  userId: z.string().uuid().optional(),
  status: z.string().optional(),
  limit: z.string().optional(),
});

type OfficeDateBoundsRow = {
  start_date: string;
  end_date: string;
  start_ts: string;
  end_ts: string;
  tz: string;
};

type OfficeHourSessionRow = {
  id: string;
  user_id: string;
  office_location_id: string | null;
  checkin_at: string;
  checkout_at: string | null;
  status: string;
  within_radius: boolean | null;
  within_grace: boolean | null;
  distance_m_at_checkin: number | null;
  distance_m_at_checkout: number | null;
  kiosk_auth_method: string | null;
  kiosk_phone_last4: string | null;
  kiosk_checkin_photo_path: string | null;
  kiosk_checkin_photo_deleted_at: string | null;
  admin_closed_by?: string | null;
  admin_closed_at?: string | null;
  admin_closed_reason?: string | null;
  admin_adjusted_checkout_at?: string | null;
  admin_exclude_from_totals?: boolean | null;
  created_at: string;
  updated_at: string;
};

function clampLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : 2000;
  if (!Number.isFinite(n)) return 2000;
  return Math.max(1, Math.min(5000, Math.floor(n)));
}

function computeDurationMinutes(checkinAtIso: string, checkoutAtIso: string | null): number | null {
  if (!checkoutAtIso) return null;
  const start = Date.parse(checkinAtIso);
  const end = Date.parse(checkoutAtIso);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(Math.round((end - start) / 60000), 0);
}

export async function GET(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const supabase = await getSupabaseRouteHandlerClient();

  const parsed = QuerySchema.safeParse({
    startDate: request.nextUrl.searchParams.get("startDate"),
    endDate: request.nextUrl.searchParams.get("endDate"),
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { startDate, endDate, userId, status, limit } = parsed.data;
  if (Date.parse(`${endDate}T00:00:00Z`) <= Date.parse(`${startDate}T00:00:00Z`)) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const allowedStatuses = new Set(["open", "closed", "auto_closed", "voided"]);
  const statuses = (status ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statuses) {
    if (!allowedStatuses.has(s)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
  }

  const boundsRes = await supabase.rpc("office_date_bounds", { _start_date: startDate, _end_date: endDate });
  if (boundsRes.error) {
    return NextResponse.json({ error: boundsRes.error.message }, { status: 500 });
  }

  const boundsRow = Array.isArray(boundsRes.data) ? (boundsRes.data[0] as OfficeDateBoundsRow | undefined) : undefined;
  if (!boundsRow || !boundsRow.start_ts || !boundsRow.end_ts || !boundsRow.tz) {
    return NextResponse.json({ error: "failed_to_resolve_bounds" }, { status: 500 });
  }
  const bounds = boundsRow;

  const admin = getSupabaseAdminClient();
  const max = clampLimit(limit);

  const baseSelect =
    "id,user_id,office_location_id,checkin_at,checkout_at,status,within_radius,within_grace,distance_m_at_checkin,distance_m_at_checkout,kiosk_auth_method,kiosk_phone_last4,kiosk_checkin_photo_path,kiosk_checkin_photo_deleted_at,created_at,updated_at";
  const selectWithAdminOverrides =
    `${baseSelect},admin_closed_by,admin_closed_at,admin_closed_reason,admin_adjusted_checkout_at,admin_exclude_from_totals`;

  function runQuery(select: string) {
    let query = admin
      .from("office_hour_sessions")
      .select(select)
      .gte("checkin_at", bounds.start_ts)
      .lt("checkin_at", bounds.end_ts)
      .order("checkin_at", { ascending: true })
      .limit(max);

    if (userId) query = query.eq("user_id", userId);
    if (statuses.length > 0) query = query.in("status", statuses);

    return query;
  }

  let adminOverridesSupported = true;

  let { data: rawSessions, error: sessionsErr } = await runQuery(selectWithAdminOverrides);
  if (sessionsErr?.message?.includes("admin_closed_by") && sessionsErr.message.includes("does not exist")) {
    // Older DBs may not have applied the admin overrides migration yet. Fall back so the admin
    // calendar still works (names/emails are still redacted below for non-allowlisted users).
    adminOverridesSupported = false;
    ({ data: rawSessions, error: sessionsErr } = await runQuery(baseSelect));
  }
  if (sessionsErr) return NextResponse.json({ error: sessionsErr.message }, { status: 500 });

  const sessions = (rawSessions ?? []) as unknown as OfficeHourSessionRow[];

  const userIds = Array.from(new Set(sessions.map((s) => s.user_id)));
  const officeLocationIds = Array.from(
    new Set(sessions.map((s) => s.office_location_id).filter((id): id is string => typeof id === "string" && id.length > 0)),
  );

  const { data: allowlistedIdsRaw, error: allowlistErr } = await admin.rpc("allowlisted_user_ids", {
    _user_ids: userIds.length > 0 ? userIds : null,
  });
  if (allowlistErr) return NextResponse.json({ error: allowlistErr.message }, { status: 500 });

  const allowlistedIds = new Set(
    ((allowlistedIdsRaw ?? []) as unknown[])
      .map((r: unknown) =>
        typeof r === "string" ? r : (r as { allowlisted_user_ids?: unknown } | null)?.allowlisted_user_ids,
      )
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
  );

  const [{ data: profiles }, { data: privates }, { data: locations }] = await Promise.all([
    admin
      .from("profiles")
      .select("id,display_name")
      .in("id", allowlistedIds.size > 0 ? Array.from(allowlistedIds) : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("profile_private")
      .select("id,email")
      .in("id", allowlistedIds.size > 0 ? Array.from(allowlistedIds) : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("office_locations")
      .select("id,name,timezone")
      .in("id", officeLocationIds.length > 0 ? officeLocationIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const displayNameById = new Map<string, string>();
  for (const p of profiles ?? []) {
    const row = p as { id: string; display_name: string | null };
    displayNameById.set(row.id, row.display_name ?? "");
  }

  const emailById = new Map<string, string>();
  for (const p of privates ?? []) {
    const row = p as { id: string; email: string | null };
    emailById.set(row.id, row.email ?? "");
  }

  const locationById = new Map<string, { name: string; timezone: string }>();
  for (const l of locations ?? []) {
    const row = l as { id: string; name: string; timezone: string | null };
    locationById.set(row.id, { name: row.name, timezone: row.timezone ?? "" });
  }

  // We must not expose names/emails for users who are not invite-allowlisted, but we should still
  // include their session records so totals and admin diagnostics remain accurate.
  const enriched = sessions.map((s) => {
    const userIsAllowlisted = allowlistedIds.has(s.user_id);
    return {
      ...s,
      user_is_allowlisted: userIsAllowlisted,
      duration_minutes: computeDurationMinutes(s.checkin_at, s.checkout_at),
      has_kiosk_selfie:
        userIsAllowlisted && !!s.kiosk_checkin_photo_path && !s.kiosk_checkin_photo_deleted_at,
      kiosk_auth_method: s.kiosk_auth_method ?? null,
      kiosk_phone_last4: s.kiosk_phone_last4 ?? null,
      user_display_name: userIsAllowlisted ? (displayNameById.get(s.user_id) ?? "") : "",
      user_email: userIsAllowlisted ? (emailById.get(s.user_id) ?? "") : "",
      office_location_name: s.office_location_id ? (locationById.get(s.office_location_id)?.name ?? "") : "",
      office_location_timezone: s.office_location_id ? (locationById.get(s.office_location_id)?.timezone ?? "") : "",
    };
  });

  return NextResponse.json({
    tz: bounds.tz,
    startDate: bounds.start_date,
    endDate: bounds.end_date,
    startTs: bounds.start_ts,
    endTs: bounds.end_ts,
    adminOverridesSupported,
    sessions: enriched,
  });
}

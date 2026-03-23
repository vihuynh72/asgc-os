import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const DateStringSchema = z
  .string()
  .transform((value) => normalizeDateOnlyString(value))
  .refine((value): value is string => typeof value === "string", { message: "invalid_week_start" });

const CreateShiftSchema = z.object({
  userId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  officeLocationId: z.string().uuid().optional(),
});

const QuerySchema = z.object({
  weekStart: DateStringSchema.optional(),
  userId: z.string().uuid().optional(),
  status: z.string().optional(),
});

type ShiftRow = {
  id: string;
  user_id: string;
  office_location_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  covered_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type PrivateRow = {
  id: string;
  email: string | null;
};

type OfficeLocationRow = {
  id: string;
  name: string;
  timezone: string | null;
};

type CoverageRequestRow = {
  id: string;
  shift_id: string;
  status: string;
};

type OfficeDateBoundsRow = {
  start_ts: string;
  end_ts: string;
};

function getWeekStart(raw: string | null): string {
  const normalized = raw ? normalizeDateOnlyString(raw) : null;
  return startOfWeekMondayDateOnly(normalized ?? todayDateString()) ?? todayDateString();
}

export async function GET(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const parsed = QuerySchema.safeParse({
    weekStart: request.nextUrl.searchParams.get("weekStart") ?? undefined,
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const weekStart = getWeekStart(parsed.data.weekStart ?? null);
  const weekEnd = addDaysDateOnly(weekStart, 7) ?? weekStart;
  const supabase = await getSupabaseRouteHandlerClient();
  const statuses = (parsed.data.status ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedStatuses = new Set(["scheduled", "cancelled", "completed", "missed"]);
  for (const status of statuses) {
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
  }

  const boundsRes = await supabase.rpc("office_date_bounds", { _start_date: weekStart, _end_date: weekEnd });
  if (boundsRes.error) {
    return NextResponse.json({ error: boundsRes.error.message }, { status: 500 });
  }

  const bounds = Array.isArray(boundsRes.data) ? (boundsRes.data[0] as OfficeDateBoundsRow | undefined) : undefined;
  if (!bounds?.start_ts || !bounds?.end_ts) {
    return NextResponse.json({ error: "failed_to_resolve_bounds" }, { status: 500 });
  }

  const admin = getSupabaseAdminClient();
  let shiftsQuery = admin
    .from("office_hour_shifts")
    .select("id,user_id,office_location_id,starts_at,ends_at,status,covered_by_user_id,created_at,updated_at")
    .gte("starts_at", bounds.start_ts)
    .lt("starts_at", bounds.end_ts)
    .order("starts_at", { ascending: true });

  if (parsed.data.userId) shiftsQuery = shiftsQuery.eq("user_id", parsed.data.userId);
  if (statuses.length > 0) shiftsQuery = shiftsQuery.in("status", statuses);

  const { data: shiftsRaw, error: shiftsError } = await shiftsQuery;
  if (shiftsError) {
    return NextResponse.json({ error: shiftsError.message }, { status: 500 });
  }

  const shifts = (shiftsRaw ?? []) as ShiftRow[];
  const userIds = Array.from(new Set(shifts.flatMap((shift) => [shift.user_id, shift.covered_by_user_id].filter(Boolean))));
  const officeLocationIds = Array.from(new Set(shifts.map((shift) => shift.office_location_id)));
  const shiftIds = shifts.map((shift) => shift.id);

  const [{ data: profilesRaw, error: profilesError }, { data: privatesRaw, error: privatesError }, { data: locationsRaw, error: locationsError }] =
    await Promise.all([
      userIds.length > 0
        ? admin.from("profiles").select("id,display_name").in("id", userIds)
        : Promise.resolve({ data: [] as ProfileRow[], error: null }),
      userIds.length > 0
        ? admin.from("profile_private").select("id,email").in("id", userIds)
        : Promise.resolve({ data: [] as PrivateRow[], error: null }),
      officeLocationIds.length > 0
        ? admin.from("office_locations").select("id,name,timezone").in("id", officeLocationIds)
        : Promise.resolve({ data: [] as OfficeLocationRow[], error: null }),
    ]);

  if (profilesError || privatesError || locationsError) {
    return NextResponse.json({ error: profilesError?.message || privatesError?.message || locationsError?.message || "lookup_failed" }, { status: 500 });
  }

  const { data: coverageRaw, error: coverageError } =
    shiftIds.length > 0
      ? await admin.from("coverage_requests").select("id,shift_id,status").in("shift_id", shiftIds)
      : { data: [] as CoverageRequestRow[], error: null };

  if (coverageError) {
    return NextResponse.json({ error: coverageError.message }, { status: 500 });
  }

  const profiles = new Map((profilesRaw ?? []).map((profile) => [profile.id, profile.display_name ?? ""]));
  const emails = new Map((privatesRaw ?? []).map((row) => [row.id, row.email ?? ""]));
  const locations = new Map((locationsRaw ?? []).map((location) => [location.id, { name: location.name, timezone: location.timezone ?? "" }]));
  const coverageByShift = new Map();

  for (const requestRow of (coverageRaw ?? []) as CoverageRequestRow[]) {
    const current = coverageByShift.get(requestRow.shift_id) ?? { open: 0, claimed: 0 };
    if (requestRow.status === "open") current.open += 1;
    if (requestRow.status === "claimed") current.claimed += 1;
    coverageByShift.set(requestRow.shift_id, current);
  }

  return NextResponse.json({
    weekStart,
    weekEnd,
    shifts: shifts.map((shift) => {
      const coverage = coverageByShift.get(shift.id) ?? { open: 0, claimed: 0 };
      return {
        ...shift,
        user_display_name: profiles.get(shift.user_id) ?? "",
        user_email: emails.get(shift.user_id) ?? "",
        covered_by_display_name: shift.covered_by_user_id ? profiles.get(shift.covered_by_user_id) ?? "" : "",
        covered_by_email: shift.covered_by_user_id ? emails.get(shift.covered_by_user_id) ?? "" : "",
        office_location_name: locations.get(shift.office_location_id)?.name ?? "",
        office_location_timezone: locations.get(shift.office_location_id)?.timezone ?? "",
        open_coverage_request_count: coverage.open,
        claimed_coverage_request_count: coverage.claimed,
      };
    }),
  });
}

// POST: Create a shift (full admin or EVP with write access)
export async function POST(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const supabase = await getSupabaseRouteHandlerClient();

  const parsed = CreateShiftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { userId, startsAt, endsAt, officeLocationId } = parsed.data;

  const { data, error } = await supabase.rpc("admin_create_office_hour_shift", {
    _user_id: userId,
    _starts_at: startsAt,
    _ends_at: endsAt,
    _office_location_id: officeLocationId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shift: data });
}

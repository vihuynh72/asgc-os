import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { normalizeDateOnlyString } from "@/lib/dateOnly";
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
  checkin_at: string;
  checkout_at: string | null;
  status: string;
  kiosk_checkin_photo_bucket: string | null;
  kiosk_checkin_photo_path: string | null;
  kiosk_checkin_photo_deleted_at: string | null;
};

function clampLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : 300;
  if (!Number.isFinite(n)) return 300;
  return Math.max(1, Math.min(1000, Math.floor(n)));
}

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: canView, error: canViewErr } = await supabase.rpc("can_view_office_hours_photos");
  if (canViewErr || !canView) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = QuerySchema.safeParse({
    startDate: request.nextUrl.searchParams.get("startDate"),
    endDate: request.nextUrl.searchParams.get("endDate"),
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { startDate, endDate, limit } = parsed.data;
  if (Date.parse(`${endDate}T00:00:00Z`) <= Date.parse(`${startDate}T00:00:00Z`)) {
    return NextResponse.json({ error: "invalid_date_range" }, { status: 400 });
  }

  const boundsRes = await supabase.rpc("office_date_bounds", { _start_date: startDate, _end_date: endDate });
  if (boundsRes.error) {
    return NextResponse.json({ error: boundsRes.error.message }, { status: 500 });
  }

  const boundsRow = Array.isArray(boundsRes.data) ? (boundsRes.data[0] as OfficeDateBoundsRow | undefined) : undefined;
  if (!boundsRow?.start_ts || !boundsRow.end_ts || !boundsRow.tz) {
    return NextResponse.json({ error: "failed_to_resolve_bounds" }, { status: 500 });
  }

  const admin = getSupabaseAdminClient();
  const max = clampLimit(limit);

  const { data: rawSessions, error: sessionsErr } = await admin
    .from("office_hour_sessions")
    .select("id,user_id,checkin_at,checkout_at,status,kiosk_checkin_photo_bucket,kiosk_checkin_photo_path,kiosk_checkin_photo_deleted_at")
    .gte("checkin_at", boundsRow.start_ts)
    .lt("checkin_at", boundsRow.end_ts)
    .not("kiosk_checkin_photo_path", "is", null)
    .is("kiosk_checkin_photo_deleted_at", null)
    .order("checkin_at", { ascending: false })
    .limit(max);

  if (sessionsErr) return NextResponse.json({ error: sessionsErr.message }, { status: 500 });

  const sessions = ((rawSessions ?? []) as OfficeHourSessionRow[]) || [];
  const userIds = Array.from(new Set(sessions.map((s) => s.user_id)));

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

  const sessionsAllowlisted = sessions.filter((s) => allowlistedIds.has(s.user_id));

  const [{ data: profiles }, { data: privates }] = await Promise.all([
    admin
      .from("profiles")
      .select("id,display_name")
      .in("id", allowlistedIds.size > 0 ? Array.from(allowlistedIds) : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("profile_private")
      .select("id,email")
      .in("id", allowlistedIds.size > 0 ? Array.from(allowlistedIds) : ["00000000-0000-0000-0000-000000000000"]),
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

  const enriched = sessionsAllowlisted.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    user_display_name: displayNameById.get(s.user_id) ?? "",
    user_email: emailById.get(s.user_id) ?? "",
    checkin_at: s.checkin_at,
    checkout_at: s.checkout_at,
    status: s.status,
  }));

  return NextResponse.json({
    tz: boundsRow.tz,
    startDate: boundsRow.start_date,
    endDate: boundsRow.end_date,
    startTs: boundsRow.start_ts,
    endTs: boundsRow.end_ts,
    sessions: enriched,
  });
}


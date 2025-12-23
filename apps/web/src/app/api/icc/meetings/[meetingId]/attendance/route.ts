import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op for JSON APIs.
      },
    },
  });
}

async function requireAuth(
  request: NextRequest,
): Promise<{ ok: true; userId: string; supabase: ReturnType<typeof createServerClient>; isAdmin: boolean } | { ok: false; response: NextResponse }>
{
  const supabase = await getSupabaseForRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin", { _uid: user.id });
  if (error) {
    return { ok: false, response: NextResponse.json({ error: "auth_check_failed" }, { status: 500 }) };
  }

  return { ok: true, userId: user.id, supabase, isAdmin: !!isAdmin };
}

const AttendanceUpdateSchema = z.object({
  clubId: z.string().uuid(),
  status: z.enum(["present", "absent", "excused"]),
  excused_reason: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const { meetingId } = await params;
  const { supabase } = authResult;

  const [attendanceRes, clubsRes] = await Promise.all([
    supabase
      .from("icc_attendance")
      .select("id,icc_meeting_id,club_id,status,present_at_call_to_order,excused_reason,notes,updated_at")
      .eq("icc_meeting_id", meetingId),
    supabase
      .from("clubs")
      .select("id,name,status,advisor_name,advisor_email")
      .order("name", { ascending: true }),
  ]);

  if (attendanceRes.error) return NextResponse.json({ error: attendanceRes.error.message }, { status: 500 });
  if (clubsRes.error) return NextResponse.json({ error: clubsRes.error.message }, { status: 500 });

  return NextResponse.json({
    attendance: attendanceRes.data ?? [],
    clubs: clubsRes.data ?? [],
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { meetingId } = await params;
  const parsed = AttendanceUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const payload = parsed.data;

  const { data, error } = await admin
    .from("icc_attendance")
    .upsert(
      {
        icc_meeting_id: meetingId,
        club_id: payload.clubId,
        status: payload.status,
        present_at_call_to_order: payload.status === "present",
        excused_reason: payload.status === "excused" ? payload.excused_reason ?? null : null,
        excused_by: payload.status === "excused" ? authResult.userId : null,
        notes: payload.notes ?? null,
      },
      { onConflict: "icc_meeting_id,club_id" },
    )
    .select("id,icc_meeting_id,club_id,status,present_at_call_to_order,excused_reason,notes,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "icc.attendance.updated",
    actor_user_id: authResult.userId,
    target_type: "icc_attendance",
    target_id: data.id,
    metadata: { club_id: payload.clubId, status: payload.status },
  });

  return NextResponse.json({ attendance: data });
}

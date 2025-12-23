import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

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

const MeetingCreateSchema = z.object({
  starts_at: z.string().datetime({ offset: true }),
  location: z.string().trim().optional().nullable(),
  term_id: z.string().uuid().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult;

  const [meetingsRes, quorumRes] = await Promise.all([
    supabase
      .from("icc_meetings")
      .select("id,term_id,starts_at,location,called_to_order_at,advisor_present,status,notes,created_at,updated_at")
      .order("starts_at", { ascending: false })
      .limit(200),
    supabase
      .from("v_icc_quorum_summary")
      .select("meeting_id,member_count,excused_count,eligible_count,present_count,quorum_required,advisor_present,quorum_met"),
  ]);

  if (meetingsRes.error) return NextResponse.json({ error: meetingsRes.error.message }, { status: 500 });
  if (quorumRes.error) return NextResponse.json({ error: quorumRes.error.message }, { status: 500 });

  const quorumByMeetingId = new Map<string, (typeof quorumRes.data)[number]>();
  for (const row of quorumRes.data ?? []) {
    quorumByMeetingId.set(row.meeting_id, row);
  }

  const meetings = (meetingsRes.data ?? []).map((meeting) => ({
    ...meeting,
    quorum: quorumByMeetingId.get(meeting.id) ?? null,
  }));

  return NextResponse.json({ meetings });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!authResult.ok) return authResult.response;
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = MeetingCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const payload = parsed.data;

  const { data, error } = await admin
    .from("icc_meetings")
    .insert({
      starts_at: payload.starts_at,
      location: payload.location ?? null,
      term_id: payload.term_id ?? null,
      status: "scheduled",
      created_by: authResult.userId,
    })
    .select("id,term_id,starts_at,location,called_to_order_at,advisor_present,status,notes,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "icc.meeting.created",
    actor_user_id: authResult.userId,
    target_type: "icc_meeting",
    target_id: data.id,
    metadata: { starts_at: data.starts_at, location: data.location },
  });

  return NextResponse.json({ meeting: data });
}

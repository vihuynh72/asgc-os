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

async function requireAdmin(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const supabase = await getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };

  const { data: isAdmin, error } = await supabase.rpc("is_admin", { _uid: user.id });
  if (error || !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}

const MeetingUpdateSchema = z.object({
  starts_at: z.string().datetime({ offset: true }).optional(),
  location: z.string().trim().optional().nullable(),
  called_to_order_at: z.string().datetime({ offset: true }).optional().nullable(),
  advisor_present: z.boolean().optional(),
  status: z.enum(["scheduled", "cancelled", "completed"]).optional(),
  notes: z.string().trim().optional().nullable(),
  term_id: z.string().uuid().optional().nullable(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const authResult = await requireAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { meetingId } = await params;
  const parsed = MeetingUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) patch[key] = value;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("icc_meetings")
    .update(patch)
    .eq("id", meetingId)
    .select("id,term_id,starts_at,location,called_to_order_at,advisor_present,status,notes,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "icc.meeting.updated",
    actor_user_id: authResult.userId,
    target_type: "icc_meeting",
    target_id: meetingId,
    metadata: patch,
  });

  return NextResponse.json({ meeting: data });
}

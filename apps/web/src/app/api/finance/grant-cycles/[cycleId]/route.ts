import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireFinanceAdmin } from "../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ cycleId: string }> };

const GrantCyclePatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  opens_at: z.string().datetime({ offset: true }).optional(),
  closes_at: z.string().datetime({ offset: true }).optional(),
  max_amount: z.number().positive().optional(),
  board_meeting_target_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { cycleId } = await params;
  const parsed = GrantCyclePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.opens_at !== undefined) update.opens_at = parsed.data.opens_at;
  if (parsed.data.closes_at !== undefined) update.closes_at = parsed.data.closes_at;
  if (parsed.data.max_amount !== undefined) update.max_amount = parsed.data.max_amount;
  if (parsed.data.board_meeting_target_id !== undefined) {
    update.board_meeting_target_id = parsed.data.board_meeting_target_id;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("grant_cycles")
    .update(update)
    .eq("id", cycleId)
    .select("id,name,opens_at,closes_at,max_amount,board_meeting_target_id,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "finance.grant_cycle.updated",
    actor_user_id: authResult.auth.userId,
    target_type: "grant_cycle",
    target_id: data.id,
    metadata: update,
  });

  return NextResponse.json({ cycle: data });
}

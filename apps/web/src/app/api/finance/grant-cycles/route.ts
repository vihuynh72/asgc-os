import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireFinanceAdmin } from "../finance-auth";

export const runtime = "nodejs";

const GrantCycleCreateSchema = z.object({
  name: z.string().trim().min(1),
  opens_at: z.string().datetime({ offset: true }),
  closes_at: z.string().datetime({ offset: true }),
  max_amount: z.number().positive(),
  board_meeting_target_id: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;
  const { data, error } = await supabase
    .from("grant_cycles")
    .select("id,name,opens_at,closes_at,max_amount,board_meeting_target_id,created_at,updated_at")
    .order("opens_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ cycles: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const parsed = GrantCycleCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const payload = parsed.data;

  const { data, error } = await admin
    .from("grant_cycles")
    .insert({
      name: payload.name,
      opens_at: payload.opens_at,
      closes_at: payload.closes_at,
      max_amount: payload.max_amount,
      board_meeting_target_id: payload.board_meeting_target_id ?? null,
    })
    .select("id,name,opens_at,closes_at,max_amount,board_meeting_target_id,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "finance.grant_cycle.created",
    actor_user_id: authResult.auth.userId,
    target_type: "grant_cycle",
    target_id: data.id,
    metadata: { name: data.name },
  });

  return NextResponse.json({ cycle: data });
}

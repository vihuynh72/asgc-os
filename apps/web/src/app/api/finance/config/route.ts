import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireFinanceAdmin } from "../finance-auth";

export const runtime = "nodejs";

const ConfigPatchSchema = z.object({
  board_action_threshold: z.number().min(0).optional(),
  grant_max: z.number().positive().optional(),
  lead_time_days: z.number().int().min(0).optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;
  const { data, error } = await supabase
    .from("config_finance")
    .select("board_action_threshold,grant_max,lead_time_days,updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}

export async function PUT(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const parsed = ConfigPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const patch: Record<string, unknown> = {};

  if (parsed.data.board_action_threshold !== undefined) {
    patch.board_action_threshold = parsed.data.board_action_threshold;
  }
  if (parsed.data.grant_max !== undefined) {
    patch.grant_max = parsed.data.grant_max;
  }
  if (parsed.data.lead_time_days !== undefined) {
    patch.lead_time_days = parsed.data.lead_time_days;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("config_finance")
    .update(patch)
    .eq("id", true)
    .select("board_action_threshold,grant_max,lead_time_days,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "finance.config.updated",
    actor_user_id: authResult.auth.userId,
    target_type: "config_finance",
    target_id: "singleton",
    metadata: patch,
  });

  return NextResponse.json({ config: data });
}

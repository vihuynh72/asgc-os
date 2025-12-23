import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireClubsAuth, requireClubsAdmin } from "../clubs-auth";

export const runtime = "nodejs";

const ClubStatusSchema = z.enum(["pending", "chartered", "suspended", "revoked", "inactive"]);

const ClubUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  status: ClubStatusSchema.optional(),
  advisor_name: z.string().trim().optional().nullable(),
  advisor_email: z.string().trim().email().optional().nullable(),
  members_count: z.number().int().min(0).optional(),
  benefit_card_count: z.number().int().min(0).optional(),
  constitution_doc_id: z.string().uuid().nullable().optional(),
  charter_term_id: z.string().uuid().nullable().optional(),
  last_charter_at: z.string().datetime({ offset: true }).nullable().optional(),
  status_reason: z.string().trim().optional().nullable(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const authResult = await requireClubsAuth(request);
  if (!authResult.ok) return authResult.response;

  const { clubId } = await params;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase
    .from("clubs")
    .select(
      "id,name,status,advisor_name,advisor_email,constitution_doc_id,members_count,benefit_card_count,last_charter_at,charter_term_id,status_reason,created_at,updated_at",
    )
    .eq("id", clubId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ club: data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const authResult = await requireClubsAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { clubId } = await params;
  const parsed = ClubUpdateSchema.safeParse(await request.json().catch(() => null));
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
    .from("clubs")
    .update(patch)
    .eq("id", clubId)
    .select(
      "id,name,status,advisor_name,advisor_email,constitution_doc_id,members_count,benefit_card_count,last_charter_at,charter_term_id,status_reason,created_at,updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "clubs.updated",
    actor_user_id: authResult.auth.userId,
    target_type: "club",
    target_id: clubId,
    metadata: patch,
  });

  return NextResponse.json({ club: data });
}

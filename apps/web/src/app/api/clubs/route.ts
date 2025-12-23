import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireClubsAuth, requireClubsAdmin } from "./clubs-auth";

export const runtime = "nodejs";

const ClubStatusSchema = z.enum(["pending", "chartered", "suspended", "revoked", "inactive"]);

const ClubCreateSchema = z.object({
  name: z.string().trim().min(1),
  status: ClubStatusSchema.optional(),
  advisor_name: z.string().trim().optional(),
  advisor_email: z.string().trim().email().optional(),
  members_count: z.number().int().min(0).optional(),
  benefit_card_count: z.number().int().min(0).optional(),
  constitution_doc_id: z.string().uuid().nullable().optional(),
  charter_term_id: z.string().uuid().nullable().optional(),
  last_charter_at: z.string().datetime({ offset: true }).nullable().optional(),
  status_reason: z.string().trim().optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireClubsAuth(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;

  const termRes = await supabase.rpc("current_term_id");
  if (termRes.error) {
    return NextResponse.json({ error: termRes.error.message }, { status: 500 });
  }
  const termId = typeof termRes.data === "string" ? termRes.data : null;

  const [clubsRes, eligibilityRes, itemsRes, checklistRes] = await Promise.all([
    supabase
      .from("clubs")
      .select(
        "id,name,status,advisor_name,advisor_email,constitution_doc_id,members_count,benefit_card_count,last_charter_at,charter_term_id,status_reason,created_at,updated_at",
      )
      .order("name", { ascending: true }),
    supabase
      .from("club_eligibility")
      .select(
        "club_id,term_id,members_count,benefit_card_count,required_benefit_cards,meets_min_members,meets_benefit_cards,charter_complete,charter_status_ok,constitution_on_file,eligible_for_funding,reasons,updated_at",
      ),
    supabase
      .from("club_charter_checklist_items")
      .select("item_key,label,description,is_required,sort_order,source_reference")
      .order("sort_order", { ascending: true }),
    supabase
      .from("club_charter_checklist")
      .select("club_id,item_key,status,checked_at,checked_by,notes")
      .order("created_at", { ascending: true }),
  ]);

  if (clubsRes.error) return NextResponse.json({ error: clubsRes.error.message }, { status: 500 });
  if (eligibilityRes.error) return NextResponse.json({ error: eligibilityRes.error.message }, { status: 500 });
  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  if (checklistRes.error) return NextResponse.json({ error: checklistRes.error.message }, { status: 500 });

  let absenceSummary: unknown[] = [];
  if (termId) {
    const { data, error } = await supabase.rpc("icc_absence_summary", { _term_id: termId });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    absenceSummary = (data ?? []) as unknown[];
  }

  return NextResponse.json({
    clubs: clubsRes.data ?? [],
    eligibility: eligibilityRes.data ?? [],
    checklistItems: itemsRes.data ?? [],
    checklist: checklistRes.data ?? [],
    absenceSummary,
    termId,
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireClubsAdmin(request);
  if (!authResult.ok) return authResult.response;

  const parsed = ClubCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const payload = parsed.data;

  const { data, error } = await admin
    .from("clubs")
    .insert({
      name: payload.name,
      status: payload.status ?? "pending",
      advisor_name: payload.advisor_name ?? null,
      advisor_email: payload.advisor_email ?? null,
      members_count: payload.members_count ?? 0,
      benefit_card_count: payload.benefit_card_count ?? 0,
      constitution_doc_id: payload.constitution_doc_id ?? null,
      charter_term_id: payload.charter_term_id ?? null,
      last_charter_at: payload.last_charter_at ?? null,
      status_reason: payload.status_reason ?? null,
    })
    .select(
      "id,name,status,advisor_name,advisor_email,constitution_doc_id,members_count,benefit_card_count,last_charter_at,charter_term_id,status_reason,created_at,updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "clubs.created",
    actor_user_id: authResult.auth.userId,
    target_type: "club",
    target_id: data.id,
    metadata: { name: data.name, status: data.status },
  });

  return NextResponse.json({ club: data });
}

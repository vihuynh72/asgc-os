import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAuth } from "../finance-auth";

export const runtime = "nodejs";

const BreakdownItemSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().positive(),
});

const GrantApplicationCreateSchema = z.object({
  cycle_id: z.string().uuid(),
  applicant_type: z.string().trim().min(1),
  club_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  amount_requested: z.number().positive(),
  breakdown: z.array(BreakdownItemSchema).min(1),
  doc_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;
  const { searchParams } = new URL(request.url);
  const cycleId = searchParams.get("cycle_id");
  const state = searchParams.get("state");

  let query = supabase
    .from("grant_applications")
    .select(
      "id,cycle_id,applicant_type,club_id,title,event_date,amount_requested,breakdown_json,advisor_approved,doc_id,state,submitted_by,submitted_at,reviewed_by,reviewed_at,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (cycleId) {
    query = query.eq("cycle_id", cycleId);
  }

  if (state) {
    query = query.eq("state", state);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ applications: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const parsed = GrantApplicationCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const payload = parsed.data;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("create_grant_application", {
    _cycle_id: payload.cycle_id,
    _applicant_type: payload.applicant_type,
    _club_id: payload.club_id ?? null,
    _title: payload.title,
    _event_date: payload.event_date ?? null,
    _amount_requested: payload.amount_requested,
    _breakdown_json: payload.breakdown,
    _doc_id: payload.doc_id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ application: data });
}

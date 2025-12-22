import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAuth } from "../finance-auth";

export const runtime = "nodejs";

const BreakdownItemSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().positive(),
});

const FundingRequestCreateSchema = z.object({
  committee_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  amount_requested: z.number().positive(),
  breakdown: z.array(BreakdownItemSchema).min(1),
});

export async function GET(request: NextRequest) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { supabase, userId, isFinanceAdmin } = authResult.auth;
  const { searchParams } = new URL(request.url);
  const mine = searchParams.get("mine");
  const state = searchParams.get("state");

  let query = supabase
    .from("funding_requests")
    .select(
      "id,requestor_user_id,committee_id,title,purpose,amount_requested,breakdown_json,needs_board_action,state,submitted_at,reviewed_by,reviewed_at,requires_contract,event_date,contract_warning,created_at,updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (!isFinanceAdmin || mine === "true") {
    query = query.eq("requestor_user_id", userId);
  }

  if (state) {
    query = query.eq("state", state);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fundingRequests: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const parsed = FundingRequestCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const payload = parsed.data;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("create_funding_request", {
    _committee_id: payload.committee_id ?? null,
    _title: payload.title,
    _purpose: payload.purpose,
    _amount_requested: payload.amount_requested,
    _breakdown_json: payload.breakdown,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ fundingRequest: data });
}

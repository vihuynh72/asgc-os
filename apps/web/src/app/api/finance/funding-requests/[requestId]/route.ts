import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAuth } from "../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ requestId: string }> };

const BreakdownItemSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().positive(),
});

const FundingRequestPatchSchema = z.object({
  committee_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).optional(),
  purpose: z.string().trim().min(1).optional(),
  amount_requested: z.number().positive().optional(),
  breakdown: z.array(BreakdownItemSchema).min(1).optional(),
  requires_contract: z.boolean().optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function GET(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { requestId } = await params;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase
    .from("funding_requests")
    .select(
      "id,requestor_user_id,committee_id,title,purpose,amount_requested,breakdown_json,needs_board_action,state,submitted_at,reviewed_by,reviewed_at,requires_contract,event_date,contract_warning,created_at,updated_at",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ fundingRequest: data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { requestId } = await params;
  const parsed = FundingRequestPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const payload = parsed.data;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("update_funding_request", {
    _request_id: requestId,
    _committee_id: payload.committee_id ?? null,
    _title: payload.title ?? null,
    _purpose: payload.purpose ?? null,
    _amount_requested: payload.amount_requested ?? null,
    _breakdown_json: payload.breakdown ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const contractPatch: Record<string, unknown> = {};
  if (payload.requires_contract !== undefined) {
    contractPatch.requires_contract = payload.requires_contract;
  }
  if (payload.event_date !== undefined) {
    contractPatch.event_date = payload.event_date;
  }

  let updatedRow = data;
  if (Object.keys(contractPatch).length > 0) {
    const { error: patchErr } = await supabase
      .from("funding_requests")
      .update(contractPatch)
      .eq("id", requestId);

    if (patchErr) {
      return NextResponse.json({ error: patchErr.message }, { status: 400 });
    }

    const { data: refreshed, error: refreshErr } = await supabase
      .from("funding_requests")
      .select(
        "id,requestor_user_id,committee_id,title,purpose,amount_requested,breakdown_json,needs_board_action,state,submitted_at,reviewed_by,reviewed_at,requires_contract,event_date,contract_warning,created_at,updated_at",
      )
      .eq("id", requestId)
      .maybeSingle();

    if (refreshErr) {
      return NextResponse.json({ error: refreshErr.message }, { status: 500 });
    }

    if (refreshed) {
      updatedRow = refreshed;
    }
  }

  return NextResponse.json({ fundingRequest: updatedRow });
}

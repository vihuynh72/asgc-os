import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAdmin } from "../../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ requestId: string }> };

const TransitionSchema = z.object({
  next_state: z.enum(["under_review", "scheduled_for_vote", "approved", "denied"]),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { requestId } = await params;
  const parsed = TransitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("transition_funding_request_state", {
    _request_id: requestId,
    _next_state: parsed.data.next_state,
    _notes: parsed.data.notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ fundingRequest: data });
}

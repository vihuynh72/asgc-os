import { NextResponse, type NextRequest } from "next/server";

import { requireFinanceAuth } from "../../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ requestId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { requestId } = await params;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("submit_funding_request", {
    _request_id: requestId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ fundingRequest: data });
}

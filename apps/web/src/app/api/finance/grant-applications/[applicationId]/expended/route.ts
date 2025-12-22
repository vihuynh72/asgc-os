import { NextResponse, type NextRequest } from "next/server";

import { requireFinanceAdmin } from "../../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ applicationId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { applicationId } = await params;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("mark_grant_expended", {
    _application_id: applicationId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ application: data });
}

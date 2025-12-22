import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAdmin } from "../../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ applicationId: string }> };

const ReviewSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { applicationId } = await params;
  const parsed = ReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { supabase } = authResult.auth;
  const { data, error } = await supabase.rpc("review_grant_application", {
    _application_id: applicationId,
    _decision: parsed.data.decision,
    _notes: parsed.data.notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ application: data });
}

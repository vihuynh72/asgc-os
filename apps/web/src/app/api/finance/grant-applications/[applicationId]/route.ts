import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAuth } from "../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ applicationId: string }> };

const BreakdownItemSchema = z.object({
  description: z.string().trim().min(1),
  amount: z.number().positive(),
});

const GrantApplicationPatchSchema = z.object({
  applicant_type: z.string().trim().min(1).optional(),
  club_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  amount_requested: z.number().positive().optional(),
  breakdown: z.array(BreakdownItemSchema).min(1).optional(),
  advisor_approved: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { applicationId } = await params;
  const parsed = GrantApplicationPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const payload = parsed.data;
  const { supabase, isFinanceAdmin } = authResult.auth;

  if (payload.advisor_approved !== undefined && !isFinanceAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const update: Record<string, unknown> = {};
  if (payload.applicant_type !== undefined) update.applicant_type = payload.applicant_type;
  if (payload.club_id !== undefined) update.club_id = payload.club_id;
  if (payload.title !== undefined) update.title = payload.title;
  if (payload.event_date !== undefined) update.event_date = payload.event_date;
  if (payload.amount_requested !== undefined) update.amount_requested = payload.amount_requested;
  if (payload.breakdown !== undefined) update.breakdown_json = payload.breakdown;
  if (payload.advisor_approved !== undefined) update.advisor_approved = payload.advisor_approved;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("grant_applications")
    .update(update)
    .eq("id", applicationId)
    .select(
      "id,cycle_id,applicant_type,club_id,title,event_date,amount_requested,breakdown_json,advisor_approved,doc_id,state,submitted_by,submitted_at,reviewed_by,reviewed_at,created_at,updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ application: data });
}

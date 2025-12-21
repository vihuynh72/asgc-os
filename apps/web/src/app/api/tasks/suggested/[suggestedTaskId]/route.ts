import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ suggestedTaskId: string }> };

const ReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  assignee_id: z.string().uuid().optional(),
  decision_notes: z.string().max(2000).optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const { suggestedTaskId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = ReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { decision, assignee_id, decision_notes } = parsed.data;

  const { data, error } = await supabase.rpc("review_suggested_task", {
    _suggested_task_id: suggestedTaskId,
    _decision: decision,
    _assignee_id: assignee_id ?? null,
    _decision_notes: decision_notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ suggestedTask: data });
}

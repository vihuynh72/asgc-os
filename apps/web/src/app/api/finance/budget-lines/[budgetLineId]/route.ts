import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireFinanceAdmin } from "../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ budgetLineId: string }> };

const BudgetLinePatchSchema = z.object({
  fiscal_year: z.number().int().min(2000).optional(),
  name: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  allocated_amount: z.number().min(0).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { budgetLineId } = await params;
  const parsed = BudgetLinePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const payload = parsed.data;

  const update: Record<string, unknown> = {};
  if (payload.fiscal_year !== undefined) update.fiscal_year = payload.fiscal_year;
  if (payload.name !== undefined) update.name = payload.name;
  if (payload.category !== undefined) update.category = payload.category;
  if (payload.allocated_amount !== undefined) update.allocated_amount = payload.allocated_amount;
  if (payload.notes !== undefined) update.notes = payload.notes;
  if (payload.is_active !== undefined) update.is_active = payload.is_active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("budget_lines")
    .update(update)
    .eq("id", budgetLineId)
    .select("id,fiscal_year,name,category,allocated_amount,notes,is_active,created_at,updated_at")
    .single();

  if (error) {
    if (error.code === "23505" || error.message.includes("budget_lines_year_name_active_unique")) {
      return NextResponse.json({ error: "budget_line_duplicate" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "finance.budget_line.updated",
    actor_user_id: authResult.auth.userId,
    target_type: "budget_line",
    target_id: data.id,
    metadata: update,
  });

  return NextResponse.json({ budgetLine: data });
}

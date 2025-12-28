import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireFinanceAdmin } from "../finance-auth";

export const runtime = "nodejs";

const BudgetLineCreateSchema = z.object({
  fiscal_year: z.number().int().min(2000),
  name: z.string().trim().min(1),
  category: z.string().trim().min(1),
  allocated_amount: z.number().min(0),
  notes: z.string().trim().max(2000).optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;
  const { searchParams } = new URL(request.url);

  const fiscalYearRaw = searchParams.get("fiscal_year");
  const isActiveRaw = searchParams.get("is_active");

  let query = supabase
    .from("budget_lines")
    .select("id,fiscal_year,name,category,allocated_amount,notes,is_active,created_at,updated_at")
    .order("fiscal_year", { ascending: false })
    .order("name", { ascending: true });

  if (fiscalYearRaw) {
    const fiscalYear = Number.parseInt(fiscalYearRaw, 10);
    if (!Number.isNaN(fiscalYear)) {
      query = query.eq("fiscal_year", fiscalYear);
    }
  }

  if (isActiveRaw === "true") {
    query = query.eq("is_active", true);
  } else if (isActiveRaw === "false") {
    query = query.eq("is_active", false);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "23505" || error.message.includes("budget_lines_year_name_active_unique")) {
      return NextResponse.json({ error: "budget_line_duplicate" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ budgetLines: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const parsed = BudgetLineCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const payload = parsed.data;

  const { data, error } = await admin
    .from("budget_lines")
    .insert({
      fiscal_year: payload.fiscal_year,
      name: payload.name,
      category: payload.category,
      allocated_amount: payload.allocated_amount,
      notes: payload.notes ?? null,
      is_active: payload.is_active ?? true,
    })
    .select("id,fiscal_year,name,category,allocated_amount,notes,is_active,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "finance.budget_line.created",
    actor_user_id: authResult.auth.userId,
    target_type: "budget_line",
    target_id: data.id,
    metadata: { fiscal_year: data.fiscal_year, amount: data.allocated_amount },
  });

  return NextResponse.json({ budgetLine: data });
}

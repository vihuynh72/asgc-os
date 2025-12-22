import { NextResponse, type NextRequest } from "next/server";

import { requireFinanceAdmin } from "../finance-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;
  const { searchParams } = new URL(request.url);
  const fiscalYearRaw = searchParams.get("fiscal_year");

  let query = supabase
    .from("v_budget_burndown")
    .select("fiscal_year,budget_line_id,name,category,allocated_amount,spent,remaining")
    .order("fiscal_year", { ascending: false });

  if (fiscalYearRaw) {
    const fiscalYear = Number.parseInt(fiscalYearRaw, 10);
    if (!Number.isNaN(fiscalYear)) {
      query = query.eq("fiscal_year", fiscalYear);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ burndown: data ?? [] });
}

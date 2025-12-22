import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAdmin, requireFinanceAuth } from "../finance-auth";

export const runtime = "nodejs";

const ExpenseCreateSchema = z.object({
  funding_request_id: z.string().uuid().nullable().optional(),
  budget_line_id: z.string().uuid(),
  payee: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional(),
  amount: z.number().positive(),
  purchased_at: z.string().datetime({ offset: true }),
  receipt_doc_id: z.string().uuid().nullable().optional(),
  status: z.enum(["pending", "approved", "rejected", "paid"]).optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;
  const { searchParams } = new URL(request.url);
  const fundingRequestId = searchParams.get("funding_request_id");
  const budgetLineId = searchParams.get("budget_line_id");

  let query = supabase
    .from("expenses")
    .select(
      "id,funding_request_id,budget_line_id,payee,description,amount,purchased_at,receipt_doc_id,status,entered_by,created_at,updated_at",
    )
    .order("purchased_at", { ascending: false })
    .limit(200);

  if (fundingRequestId) {
    query = query.eq("funding_request_id", fundingRequestId);
  }

  if (budgetLineId) {
    query = query.eq("budget_line_id", budgetLineId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ expenses: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const parsed = ExpenseCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const payload = parsed.data;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("create_expense", {
    _funding_request_id: payload.funding_request_id ?? null,
    _budget_line_id: payload.budget_line_id,
    _payee: payload.payee,
    _description: payload.description ?? null,
    _amount: payload.amount,
    _purchased_at: payload.purchased_at,
    _receipt_doc_id: payload.receipt_doc_id ?? null,
    _status: payload.status ?? "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ expense: data });
}

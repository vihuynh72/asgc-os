import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAdmin } from "../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ expenseId: string }> };

const ExpensePatchSchema = z.object({
  funding_request_id: z.string().uuid().nullable().optional(),
  budget_line_id: z.string().uuid().optional(),
  payee: z.string().trim().min(1).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  amount: z.number().positive().optional(),
  purchased_at: z.string().datetime({ offset: true }).optional(),
  receipt_doc_id: z.string().uuid().nullable().optional(),
  status: z.enum(["pending", "approved", "rejected", "paid"]).optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const { expenseId } = await params;
  const parsed = ExpensePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const payload = parsed.data;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("update_expense", {
    _expense_id: expenseId,
    _payee: payload.payee ?? null,
    _description: payload.description ?? null,
    _amount: payload.amount ?? null,
    _purchased_at: payload.purchased_at ?? null,
    _receipt_doc_id: payload.receipt_doc_id ?? null,
    _status: payload.status ?? null,
    _budget_line_id: payload.budget_line_id ?? null,
    _funding_request_id: payload.funding_request_id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ expense: data });
}

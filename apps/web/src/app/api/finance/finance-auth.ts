import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";

export type FinanceAuth = {
  userId: string;
  supabase: ReturnType<typeof createServerClient>;
  isFinanceAdmin: boolean;
  isBoardMember: boolean;
};

async function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op for JSON APIs.
      },
    },
  });
}

export async function requireFinanceAuth(
  request: NextRequest,
): Promise<{ ok: true; auth: FinanceAuth } | { ok: false; response: NextResponse }>
{
  const supabase = await getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const [{ data: isFinanceAdmin, error: financeErr }, { data: isBoardMember, error: boardErr }] =
    await Promise.all([
      supabase.rpc("is_finance_admin", { _uid: user.id }),
      supabase.rpc("is_board_member", { _uid: user.id }),
    ]);

  if (financeErr || boardErr) {
    return { ok: false, response: NextResponse.json({ error: "auth_check_failed" }, { status: 500 }) };
  }

  return {
    ok: true,
    auth: {
      userId: user.id,
      supabase,
      isFinanceAdmin: !!isFinanceAdmin,
      isBoardMember: !!isBoardMember,
    },
  };
}

export async function requireFinanceAdmin(
  request: NextRequest,
): Promise<{ ok: true; auth: FinanceAuth } | { ok: false; response: NextResponse }>
{
  const result = await requireFinanceAuth(request);
  if (!result.ok) return result;

  if (!result.auth.isFinanceAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return result;
}

export async function requireBoardOrFinance(
  request: NextRequest,
): Promise<{ ok: true; auth: FinanceAuth } | { ok: false; response: NextResponse }>
{
  const result = await requireFinanceAuth(request);
  if (!result.ok) return result;

  if (!result.auth.isFinanceAdmin && !result.auth.isBoardMember) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return result;
}

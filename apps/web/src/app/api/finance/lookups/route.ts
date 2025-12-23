import { NextResponse } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await getSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [{ data: isFinanceAdmin, error: financeErr }, { data: isBoardMember, error: boardErr }] = await Promise.all([
    supabase.rpc("is_finance_admin", { _uid: user.id }),
    supabase.rpc("is_board_member", { _uid: user.id }),
  ]);

  const allowUserLookup = (!financeErr && !!isFinanceAdmin) || (!boardErr && !!isBoardMember);

  const [
    committeesRes,
    meetingsRes,
    requestsRes,
    budgetLinesRes,
    grantCyclesRes,
    clubsRes,
    docsRes,
    usersRes,
  ] = await Promise.all([
    supabase.from("committees").select("id,name,committee_key").order("name", { ascending: true }).limit(200),
    supabase
      .from("meetings")
      .select("id,title,meeting_type,starts_at,status")
      .order("starts_at", { ascending: false })
      .limit(200),
    supabase
      .from("funding_requests")
      .select("id,title,amount_requested,state,committee_id,submitted_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("budget_lines")
      .select("id,name,fiscal_year,category,is_active")
      .order("fiscal_year", { ascending: false })
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("grant_cycles")
      .select("id,name,opens_at,closes_at,max_amount")
      .order("opens_at", { ascending: false })
      .limit(200),
    supabase.from("clubs").select("id,name,status").order("name", { ascending: true }).limit(200),
    supabase.from("docs").select("id,title,doc_type,created_at").order("created_at", { ascending: false }).limit(100),
    allowUserLookup
      ? supabase.from("profiles").select("id,display_name,status").eq("status", "active").order("display_name", {
          ascending: true,
        })
        .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const errors = [
    committeesRes.error,
    meetingsRes.error,
    requestsRes.error,
    budgetLinesRes.error,
    grantCyclesRes.error,
    clubsRes.error,
    docsRes.error,
    usersRes.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0]?.message ?? "lookup_failed" }, { status: 500 });
  }

  return NextResponse.json({
    committees: committeesRes.data ?? [],
    meetings: meetingsRes.data ?? [],
    fundingRequests: requestsRes.data ?? [],
    budgetLines: budgetLinesRes.data ?? [],
    grantCycles: grantCyclesRes.data ?? [],
    clubs: clubsRes.data ?? [],
    docs: docsRes.data ?? [],
    users: usersRes.data ?? [],
  });
}

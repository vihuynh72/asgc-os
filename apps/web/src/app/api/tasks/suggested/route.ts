import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr) {
    return NextResponse.json({ error: adminErr.message }, { status: 500 });
  }

  if (isAdmin) {
    const { data, error } = await supabase
      .from("suggested_tasks")
      .select(
        "id,committee_id,source_doc_id,source_summary_id,proposed_title,proposed_description,status,created_at,reviewed_at,published_task_id,docs(id,title),committees(id,name)",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ suggestedTasks: data ?? [] });
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("committee_memberships")
    .select("committee_id")
    .order("created_at", { ascending: true });

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  }

  const committeeIds = Array.from(
    new Set(
      (memberships ?? [])
        .map((m) => (m as { committee_id: string | null }).committee_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );

  if (committeeIds.length === 0) {
    return NextResponse.json({ suggestedTasks: [] });
  }

  const { data, error } = await supabase
    .from("suggested_tasks")
    .select(
      "id,committee_id,source_doc_id,source_summary_id,proposed_title,proposed_description,status,created_at,reviewed_at,published_task_id,docs(id,title),committees(id,name)",
    )
    .in("committee_id", committeeIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suggestedTasks: data ?? [] });
}

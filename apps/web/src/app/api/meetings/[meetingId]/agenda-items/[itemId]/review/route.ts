import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ meetingId: string; itemId: string }> };

// POST: Admin review agenda item (accept/reject/table)
export async function POST(request: NextRequest, { params }: Params) {
  const { itemId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Check admin
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    state?: string;
    admin_notes?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.state || !["accepted", "rejected", "tabled"].includes(body.state)) {
    return NextResponse.json({ error: "invalid_state" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_review_agenda_item", {
    _item_id: itemId,
    _new_state: body.state,
    _admin_notes: body.admin_notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}

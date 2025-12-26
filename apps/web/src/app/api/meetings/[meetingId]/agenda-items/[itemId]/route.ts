import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ meetingId: string; itemId: string }> };

// GET: Get a single agenda item
export async function GET(request: NextRequest, { params }: Params) {
  const { itemId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("agenda_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  }

  return NextResponse.json({ item: data });
}

// PATCH: Update an agenda item
export async function PATCH(request: NextRequest, { params }: Params) {
  const { meetingId, itemId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (meetingId) {
    const { data: deadlineInfo, error: deadlineErr } = await supabase.rpc("meeting_deadline_info", {
      _meeting_id: meetingId,
    });
    if (deadlineErr) {
      return NextResponse.json({ error: deadlineErr.message }, { status: 400 });
    }
    const deadline = Array.isArray(deadlineInfo) ? deadlineInfo[0] : deadlineInfo;
    if (deadline?.is_past_deadline) {
      return NextResponse.json({ error: "submission_closed" }, { status: 403 });
    }
  }

  let body: {
    title?: string;
    category?: string;
    background?: string;
    recommended_motion?: string;
    fiscal_impact?: string;
    attachments_json?: unknown[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("update_agenda_item", {
    _item_id: itemId,
    _title: body.title ?? null,
    _category: body.category ?? null,
    _background: body.background ?? null,
    _recommended_motion: body.recommended_motion ?? null,
    _fiscal_impact: body.fiscal_impact ?? null,
    _attachments_json: body.attachments_json ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}

// DELETE: Withdraw an agenda item
export async function DELETE(request: NextRequest, { params }: Params) {
  const { itemId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("withdraw_agenda_item", {
    _item_id: itemId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}

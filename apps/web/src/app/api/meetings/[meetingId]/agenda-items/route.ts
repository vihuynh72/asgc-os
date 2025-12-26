import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ meetingId: string }> };

// GET: List agenda items for a meeting
export async function GET(request: NextRequest, { params }: Params) {
  const { meetingId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "meeting_id_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("meeting_agenda_items", {
    _meeting_id: meetingId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also get deadline info
  const { data: deadlineInfo, error: deadlineErr } = await supabase.rpc("meeting_deadline_info", {
    _meeting_id: meetingId,
  });

  return NextResponse.json({
    items: data ?? [],
    deadline: deadlineErr ? null : (Array.isArray(deadlineInfo) ? deadlineInfo[0] : deadlineInfo),
  });
}

// POST: Submit a new agenda item
export async function POST(request: NextRequest, { params }: Params) {
  const { meetingId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!meetingId || typeof meetingId !== "string") {
    return NextResponse.json({ error: "meeting_id_required" }, { status: 400 });
  }

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

  let body: {
    title?: string;
    category?: string;
    background?: string;
    recommended_motion?: string;
    fiscal_impact?: string;
    attachments_json?: unknown[];
    submit_immediately?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("submit_agenda_item", {
    _meeting_id: meetingId,
    _title: body.title,
    _category: body.category ?? "discussion",
    _background: body.background ?? null,
    _recommended_motion: body.recommended_motion ?? null,
    _fiscal_impact: body.fiscal_impact ?? null,
    _attachments_json: body.attachments_json ?? [],
    _submit_immediately: body.submit_immediately ?? false,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}

import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ meetingId: string; itemId: string }> };

// POST: Submit a draft item (finalize)
export async function POST(request: NextRequest, { params }: Params) {
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

  const { data, error } = await supabase.rpc("finalize_agenda_item", {
    _item_id: itemId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}

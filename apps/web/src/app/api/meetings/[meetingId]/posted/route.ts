import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ meetingId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { meetingId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    agenda_posted_at?: string | null;
    minutes_posted_at?: string | null;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  for (const key of ["agenda_posted_at", "minutes_posted_at"] as const) {
    const value = body[key];
    if (value !== undefined && value !== null && typeof value !== "string") {
      return NextResponse.json({ error: `invalid_${key}` }, { status: 400 });
    }
  }

  if (body.agenda_posted_at === undefined && body.minutes_posted_at === undefined) {
    return NextResponse.json({ error: "posted_at_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("mark_meeting_posted", {
    _meeting_id: meetingId,
    _agenda_posted_at: body.agenda_posted_at ?? null,
    _minutes_posted_at: body.minutes_posted_at ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ meeting: data });
}

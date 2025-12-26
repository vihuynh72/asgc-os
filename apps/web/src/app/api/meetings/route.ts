import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// GET: List upcoming meetings for the current user
export async function GET(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const includePast = searchParams.get("includePast") === "1";

  const { data, error } = includePast
    ? await supabase
        .from("meetings")
        .select(
          "id,committee_id,meeting_type,title,description,location,remote_url,livestream_url,public_comment_instructions,notice_posted_at,agenda_posted_at,minutes_posted_at,starts_at,ends_at,status,created_by,created_at,updated_at",
        )
        .order("starts_at", { ascending: false })
        .limit(200)
    : await supabase.rpc("my_upcoming_meetings", { _limit: 20 });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ meetings: data ?? [] });
}

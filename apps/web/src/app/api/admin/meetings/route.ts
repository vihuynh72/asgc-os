import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { requireAnyAdminRead, requirePartialAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

// GET: List meetings (any admin tier can read)
export async function GET(request: NextRequest) {
  const authz = await requireAnyAdminRead(request);
  if (!authz.ok) return authz.response;

  const supabase = await getSupabaseRouteHandlerClient();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let query = supabase
    .from("meetings")
    .select("id,committee_id,meeting_type,title,description,location,starts_at,ends_at,status,created_at,updated_at")
    .order("starts_at", { ascending: false })
    .limit(200);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ meetings: data ?? [] });
}

// POST: Create a meeting (partial admin or higher with write access)
export async function POST(request: NextRequest) {
  const authz = await requirePartialAdmin(request);
  if (!authz.ok) return authz.response;

  const supabase = await getSupabaseRouteHandlerClient();

  let body: {
    meeting_type?: string;
    title?: string;
    starts_at?: string;
    ends_at?: string;
    committee_id?: string;
    description?: string;
    location?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const meetingType = body.meeting_type;
  const title = body.title;
  const startsAt = body.starts_at;
  const endsAt = body.ends_at;

  if (!meetingType || typeof meetingType !== "string") {
    return NextResponse.json({ error: "meeting_type_required" }, { status: 400 });
  }

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }

  if (!startsAt || typeof startsAt !== "string") {
    return NextResponse.json({ error: "starts_at_required" }, { status: 400 });
  }

  if (!endsAt || typeof endsAt !== "string") {
    return NextResponse.json({ error: "ends_at_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_create_meeting", {
    _meeting_type: meetingType,
    _title: title,
    _starts_at: startsAt,
    _ends_at: endsAt,
    _committee_id: body.committee_id ?? null,
    _description: body.description ?? null,
    _location: body.location ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ meeting: data });
}

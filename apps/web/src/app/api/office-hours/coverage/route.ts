import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// GET: List open coverage requests
export async function GET() {
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("open_coverage_requests");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

// POST: Create a coverage request for own shift
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { shift_id?: string; notes?: string };
  try {
    body = (await request.json()) as { shift_id?: string; notes?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const shiftId = body.shift_id;
  if (!shiftId || typeof shiftId !== "string") {
    return NextResponse.json({ error: "shift_id_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("request_coverage", {
    _shift_id: shiftId,
    _notes: body.notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ request: data });
}

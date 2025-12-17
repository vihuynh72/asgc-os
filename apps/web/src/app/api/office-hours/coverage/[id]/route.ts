import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// POST: Claim a coverage request
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "request_id_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("claim_coverage", {
    _request_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ request: data });
}

// DELETE: Cancel a coverage request
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "request_id_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("cancel_coverage_request", {
    _request_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ request: data });
}

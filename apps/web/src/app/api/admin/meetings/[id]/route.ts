import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// PATCH: Update a meeting (admin only)
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
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

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "meeting_id_required" }, { status: 400 });
  }

  let body: {
    title?: string;
    description?: string;
    location?: string;
    starts_at?: string;
    ends_at?: string;
    status?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_update_meeting", {
    _meeting_id: id,
    _title: body.title ?? null,
    _description: body.description ?? null,
    _location: body.location ?? null,
    _starts_at: body.starts_at ?? null,
    _ends_at: body.ends_at ?? null,
    _status: body.status ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ meeting: data });
}

// DELETE: Cancel a meeting (admin only)
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
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

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "meeting_id_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_cancel_meeting", {
    _meeting_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ meeting: data });
}

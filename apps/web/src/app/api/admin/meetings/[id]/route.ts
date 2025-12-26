import { NextResponse, type NextRequest } from "next/server";

import { requirePartialAdmin } from "@/lib/adminAuth";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// PATCH: Update a meeting (admin only)
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authz = await requirePartialAdmin(request);
  if (!authz.ok) return authz.response;
  const supabase = await getSupabaseRouteHandlerClient();

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
    remote_url?: string;
    livestream_url?: string;
    public_comment_instructions?: string;
    notice_posted_at?: string | null;
    agenda_posted_at?: string | null;
    minutes_posted_at?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.remote_url !== undefined && typeof body.remote_url !== "string") {
    return NextResponse.json({ error: "invalid_remote_url" }, { status: 400 });
  }
  if (body.livestream_url !== undefined && typeof body.livestream_url !== "string") {
    return NextResponse.json({ error: "invalid_livestream_url" }, { status: 400 });
  }
  if (
    body.public_comment_instructions !== undefined &&
    typeof body.public_comment_instructions !== "string"
  ) {
    return NextResponse.json({ error: "invalid_public_comment_instructions" }, { status: 400 });
  }
  for (const key of ["notice_posted_at", "agenda_posted_at", "minutes_posted_at"] as const) {
    const value = body[key];
    if (value !== undefined && value !== null && typeof value !== "string") {
      return NextResponse.json({ error: `invalid_${key}` }, { status: 400 });
    }
  }

  const payload: Record<string, unknown> = {
    _meeting_id: id,
    _title: body.title ?? null,
    _description: body.description ?? null,
    _location: body.location ?? null,
    _starts_at: body.starts_at ?? null,
    _ends_at: body.ends_at ?? null,
    _status: body.status ?? null,
  };

  if (Object.prototype.hasOwnProperty.call(body, "remote_url")) {
    payload._remote_url = body.remote_url ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "livestream_url")) {
    payload._livestream_url = body.livestream_url ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "public_comment_instructions")) {
    payload._public_comment_instructions = body.public_comment_instructions ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "notice_posted_at")) {
    payload._notice_posted_at = body.notice_posted_at ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "agenda_posted_at")) {
    payload._agenda_posted_at = body.agenda_posted_at ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "minutes_posted_at")) {
    payload._minutes_posted_at = body.minutes_posted_at ?? null;
  }

  const { data, error } = await supabase.rpc("admin_update_meeting", payload);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ meeting: data });
}

// DELETE: Cancel a meeting (admin only)
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const authz = await requirePartialAdmin(request);
  if (!authz.ok) return authz.response;
  const supabase = await getSupabaseRouteHandlerClient();

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

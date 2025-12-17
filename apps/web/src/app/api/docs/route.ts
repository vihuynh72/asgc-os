import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// GET: List docs with optional filters
export async function GET(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const docType = searchParams.get("doc_type");
  const committeeId = searchParams.get("committee_id");
  const meetingId = searchParams.get("meeting_id");
  const visibility = searchParams.get("visibility");
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const { data, error } = await supabase.rpc("list_docs", {
    _doc_type: docType,
    _committee_id: committeeId,
    _meeting_id: meetingId,
    _visibility: visibility,
    _limit: Math.min(limit, 100),
    _offset: Math.max(offset, 0),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ docs: data ?? [] });
}

// POST: Create a doc record (after file upload)
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    title?: string;
    doc_type?: string;
    storage_path?: string;
    storage_bucket?: string;
    mime_type?: string;
    size_bytes?: number;
    visibility?: string;
    committee_id?: string;
    meeting_id?: string;
    description?: string;
    checksum_sha256?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.title || typeof body.title !== "string") {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }

  if (!body.doc_type || typeof body.doc_type !== "string") {
    return NextResponse.json({ error: "doc_type_required" }, { status: 400 });
  }

  if (!body.storage_path || typeof body.storage_path !== "string") {
    return NextResponse.json({ error: "storage_path_required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_doc", {
    _title: body.title,
    _doc_type: body.doc_type,
    _storage_path: body.storage_path,
    _storage_bucket: body.storage_bucket ?? "documents",
    _mime_type: body.mime_type ?? null,
    _size_bytes: body.size_bytes ?? null,
    _visibility: body.visibility ?? "internal",
    _committee_id: body.committee_id ?? null,
    _meeting_id: body.meeting_id ?? null,
    _description: body.description ?? null,
    _checksum_sha256: body.checksum_sha256 ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ doc: data });
}

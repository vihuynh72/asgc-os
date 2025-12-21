import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ docId: string }> };

// GET: Get doc metadata and signed URL
export async function GET(request: NextRequest, { params }: Params) {
  const { docId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Check access via RPC
  const { data: canView, error: accessErr } = await supabase.rpc("can_view_doc", {
    _doc_id: docId,
  });

  if (accessErr || !canView) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Get doc metadata
  const { data: doc, error: docErr } = await supabase
    .from("docs")
    .select("*")
    .eq("id", docId)
    .maybeSingle();

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  if (!doc) {
    return NextResponse.json({ error: "doc_not_found" }, { status: 404 });
  }

  let signedUrl: string | null = null;
  if (doc.storage_path) {
    const { data: signedUrlData, error: urlErr } = await supabase.storage
      .from(doc.storage_bucket)
      .createSignedUrl(doc.storage_path, 3600);

    signedUrl = urlErr ? null : signedUrlData?.signedUrl ?? null;
  }

  return NextResponse.json({
    doc,
    signedUrl,
  });
}

// PATCH: Update doc metadata
export async function PATCH(request: NextRequest, { params }: Params) {
  const { docId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    visibility?: string;
    committee_id?: string;
    meeting_id?: string;
    content_text?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.content_text !== undefined && typeof body.content_text !== "string") {
    return NextResponse.json({ error: "invalid_content_text" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("update_doc", {
    _doc_id: docId,
    _title: body.title ?? null,
    _description: body.description ?? null,
    _visibility: body.visibility ?? null,
    _committee_id: body.committee_id ?? null,
    _meeting_id: body.meeting_id ?? null,
    _content_text: body.content_text ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ doc: data });
}

// DELETE: Soft delete doc
export async function DELETE(request: NextRequest, { params }: Params) {
  const { docId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("delete_doc", {
    _doc_id: docId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ doc: data });
}

import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ docId: string }> };

// GET: Get a signed upload URL for updating a doc's file
// POST: Upload a new version of the file (creates signed upload URL)
export async function POST(request: NextRequest, { params }: Params) {
  const { docId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Get existing doc to verify ownership
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

  // Check admin status
  const { data: isAdmin } = await supabase.rpc("is_admin");

  if (doc.uploaded_by !== user.id && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: {
    filename?: string;
    content_type?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.filename || typeof body.filename !== "string") {
    return NextResponse.json({ error: "filename_required" }, { status: 400 });
  }

  // Generate new storage path
  const ext = body.filename.split(".").pop() ?? "";
  const newPath = `${user.id}/${Date.now()}.${ext}`;

  // Create signed upload URL
  const { data: uploadUrl, error: uploadErr } = await supabase.storage
    .from(doc.storage_bucket)
    .createSignedUploadUrl(newPath);

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  return NextResponse.json({
    uploadUrl: uploadUrl?.signedUrl ?? null,
    token: uploadUrl?.token ?? null,
    path: newPath,
    bucket: doc.storage_bucket,
  });
}

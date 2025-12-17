import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// POST: Get a signed upload URL for a new doc
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    filename?: string;
    content_type?: string;
    bucket?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.filename || typeof body.filename !== "string") {
    return NextResponse.json({ error: "filename_required" }, { status: 400 });
  }

  const bucket = body.bucket ?? "documents";
  const allowedBuckets = ["documents", "minutes", "receipts"];

  if (!allowedBuckets.includes(bucket)) {
    return NextResponse.json({ error: "invalid_bucket" }, { status: 400 });
  }

  // Generate storage path: user_id/timestamp.sanitized_filename
  const sanitizedFilename = body.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
  const path = `${user.id}/${Date.now()}_${sanitizedFilename}`;

  // Create signed upload URL (valid for 5 minutes)
  const { data: uploadUrl, error: uploadErr } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  return NextResponse.json({
    uploadUrl: uploadUrl?.signedUrl ?? null,
    token: uploadUrl?.token ?? null,
    path,
    bucket,
  });
}

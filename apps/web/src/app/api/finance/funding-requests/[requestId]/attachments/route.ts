import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFinanceAuth } from "../../../finance-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ requestId: string }> };

const AttachmentSchema = z.object({
  doc_id: z.string().uuid(),
  doc_kind: z.enum(["attachment", "quote", "invoice", "other"]).optional(),
});

export async function GET(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { requestId } = await params;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase
    .from("funding_request_docs")
    .select(
      "id,doc_kind,created_at,docs(id,title,doc_type,storage_bucket,storage_path,visibility,mime_type,size_bytes,created_at)",
    )
    .eq("funding_request_id", requestId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ attachments: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const authResult = await requireFinanceAuth(request);
  if (!authResult.ok) return authResult.response;

  const { requestId } = await params;
  const parsed = AttachmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { supabase } = authResult.auth;
  const { data, error } = await supabase
    .from("funding_request_docs")
    .insert({
      funding_request_id: requestId,
      doc_id: parsed.data.doc_id,
      doc_kind: parsed.data.doc_kind ?? "attachment",
    })
    .select("id,doc_kind,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ attachment: data });
}

import { NextResponse, type NextRequest } from "next/server";

import { summarizeCommitteeNote } from "@/lib/ai";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ docId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { docId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("doc_summaries")
    .select("id,doc_id,summary_text,status,created_by,created_at,model_info_json,prompt_text")
    .eq("doc_id", docId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ summaries: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { docId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: doc, error: docErr } = await supabase
    .from("docs")
    .select("id,doc_type,content_text")
    .eq("id", docId)
    .maybeSingle();

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  if (!doc) {
    return NextResponse.json({ error: "doc_not_found" }, { status: 404 });
  }

  if (doc.doc_type !== "committee_notes") {
    return NextResponse.json({ error: "invalid_doc_type" }, { status: 400 });
  }

  if (!doc.content_text) {
    return NextResponse.json({ error: "content_text_required" }, { status: 400 });
  }

  try {
    const { summaryText, modelInfo, promptText } = await summarizeCommitteeNote(doc.content_text);

    const { data: summary, error } = await supabase.rpc("create_doc_summary", {
      _doc_id: docId,
      _summary_text: summaryText,
      _model_info_json: modelInfo,
      _prompt_text: promptText,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "summary_failed" },
      { status: 500 },
    );
  }
}

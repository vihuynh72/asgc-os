import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { extractSuggestedTasks } from "@/lib/ai";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ docId: string }> };

const GenerateSchema = z.object({
  summary_id: z.string().uuid().optional(),
});

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
    .from("suggested_tasks")
    .select(
      "id,source_doc_id,source_summary_id,committee_id,proposed_title,proposed_description,proposed_assignee,status,created_at,reviewed_at,published_task_id",
    )
    .eq("source_doc_id", docId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suggestedTasks: data ?? [] });
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

  const parsed = GenerateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
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

  const summaryId = parsed.data.summary_id;

  const summaryQuery = supabase
    .from("doc_summaries")
    .select("id,doc_id,summary_text")
    .eq("doc_id", docId)
    .order("created_at", { ascending: false })
    .limit(1);

  const { data: summaryRow, error: summaryErr } = summaryId
    ? await supabase.from("doc_summaries").select("id,doc_id,summary_text").eq("id", summaryId).maybeSingle()
    : await summaryQuery.maybeSingle();

  if (summaryErr) {
    return NextResponse.json({ error: summaryErr.message }, { status: 500 });
  }

  if (!summaryRow || summaryRow.doc_id !== docId) {
    return NextResponse.json({ error: "summary_not_found" }, { status: 404 });
  }

  try {
    const { tasks, modelInfo, promptText } = await extractSuggestedTasks(
      doc.content_text,
      summaryRow.summary_text,
    );

    const { data: suggestedTasks, error } = await supabase.rpc("create_suggested_tasks", {
      _source_doc_id: docId,
      _summary_id: summaryRow.id,
      _tasks: tasks,
      _model_info_json: modelInfo,
      _prompt_text: promptText,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ suggestedTasks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "suggested_tasks_failed" },
      { status: 500 },
    );
  }
}

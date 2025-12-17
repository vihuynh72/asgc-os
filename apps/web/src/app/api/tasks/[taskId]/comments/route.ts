import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";

export const runtime = "nodejs";

function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op
      },
    },
  });
}

type TaskCommentRow = {
  id: string;
  task_id: string;
  body: string;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: comments, error } = await supabase
    .from("task_comments")
    .select("id,task_id,body,created_by,created_at,deleted_at,deleted_by")
    .eq("task_id", taskId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comments: (comments ?? []) as TaskCommentRow[] });
}

const CreateCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });

  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = CreateCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const { body } = parsed.data;

  const { data: comment, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, body, created_by: user.id })
    .select("id,task_id,body,created_by,created_at,deleted_at,deleted_by")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ comment: comment as TaskCommentRow });
}

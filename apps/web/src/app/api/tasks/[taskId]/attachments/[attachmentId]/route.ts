import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string; attachmentId: string }> },
) {
  const { taskId, attachmentId } = await params;
  if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  if (!attachmentId) return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });

  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: updated, error } = await supabase
    .from("task_attachments")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", attachmentId)
    .eq("task_id", taskId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

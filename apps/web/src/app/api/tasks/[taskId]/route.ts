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

type TaskRow = {
  id: string;
  committee_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
  due_at: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const PatchTaskSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(["todo", "doing", "done"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    projectId: z.string().uuid().nullable().optional(),
    assignedTo: z.string().uuid().nullable().optional(),
  })
  .refine((x) => Object.keys(x).length > 0, { message: "empty patch" });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = PatchTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof parsed.data.title === "string") patch.title = parsed.data.title;
  if (parsed.data.description === null || typeof parsed.data.description === "string") patch.description = parsed.data.description;
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.priority) patch.priority = parsed.data.priority;
  if (parsed.data.dueAt === null || typeof parsed.data.dueAt === "string") patch.due_at = parsed.data.dueAt;
  if (parsed.data.projectId === null || typeof parsed.data.projectId === "string") patch.project_id = parsed.data.projectId;
  if (parsed.data.assignedTo === null || typeof parsed.data.assignedTo === "string") patch.assigned_to = parsed.data.assignedTo;

  const { data: task, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select("id,committee_id,project_id,title,description,status,priority,due_at,assigned_to,created_by,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: task as TaskRow });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

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
        // No-op: API responses don't need to refresh auth cookies.
      },
    },
  });
}

type CommitteeRow = {
  id: string;
  committee_key: string;
  name: string;
};

type TaskRow = {
  id: string;
  committee_id: string;
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

export async function GET(request: NextRequest) {
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("committee_memberships")
    .select("committee_id")
    .order("created_at", { ascending: true });

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  }

  const committeeIds = Array.from(
    new Set(
      (memberships ?? [])
        .map((m) => (m as { committee_id: string | null }).committee_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );

  const { data: committees, error: committeesError } = await supabase
    .from("committees")
    .select("id,committee_key,name")
    .in("id", committeeIds.length > 0 ? committeeIds : ["00000000-0000-0000-0000-000000000000"])
    .order("name", { ascending: true });

  if (committeesError) {
    return NextResponse.json({ error: committeesError.message }, { status: 500 });
  }

  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id,committee_id,title,description,status,priority,due_at,assigned_to,created_by,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 500 });
  }

  return NextResponse.json({ tasks: (tasks ?? []) as TaskRow[], committees: ((committees ?? []) as CommitteeRow[]) });
}

const CreateTaskSchema = z.object({
  committeeId: z.string().uuid(),
  title: z.string().trim().min(1),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  assignToMe: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = CreateTaskSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { committeeId, title, description, priority, dueAt, assignToMe } = parsed.data;

  const insertRow: Record<string, unknown> = {
    committee_id: committeeId,
    title,
    description: description ?? null,
    priority: priority ?? "medium",
    due_at: dueAt ?? null,
    created_by: user.id,
    assigned_to: assignToMe ? user.id : null,
    status: "todo",
  };

  const { data: task, error } = await supabase
    .from("tasks")
    .insert(insertRow)
    .select("id,committee_id,title,description,status,priority,due_at,assigned_to,created_by,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: task as TaskRow });
}

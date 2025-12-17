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

type ProjectRow = {
  id: string;
  committee_id: string;
  name: string;
  status: "active" | "archived";
  created_by: string;
  created_at: string;
  updated_at: string;
};

const PatchProjectSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine((x) => Object.keys(x).length > 0, { message: "empty patch" });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = PatchProjectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof parsed.data.name === "string") patch.name = parsed.data.name;
  if (parsed.data.status) patch.status = parsed.data.status;

  const { data: project, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .select("id,committee_id,name,status,created_by,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: project as ProjectRow });
}

export async function DELETE() {
  // Best practice: avoid hard-deletes for projects; archive instead.
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}

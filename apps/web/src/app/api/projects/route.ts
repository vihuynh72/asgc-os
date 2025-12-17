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

export async function GET(request: NextRequest) {
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl;
  const committeeId = url.searchParams.get("committeeId");
  const status = url.searchParams.get("status");

  let query = supabase
    .from("projects")
    .select("id,committee_id,name,status,created_by,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (committeeId) {
    query = query.eq("committee_id", committeeId);
  }

  if (status === "active" || status === "archived") {
    query = query.eq("status", status);
  }

  const { data: projects, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects: (projects ?? []) as ProjectRow[] });
}

const CreateProjectSchema = z.object({
  committeeId: z.string().uuid(),
  name: z.string().trim().min(1),
});

export async function POST(request: NextRequest) {
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = CreateProjectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { committeeId, name } = parsed.data;

  const { data: project, error } = await supabase
    .from("projects")
    .insert({ committee_id: committeeId, name, status: "active", created_by: user.id })
    .select("id,committee_id,name,status,created_by,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: project as ProjectRow });
}

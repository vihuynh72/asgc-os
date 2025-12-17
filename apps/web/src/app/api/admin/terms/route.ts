import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function isAdminForRequest(request: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const env = getPublicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op: these admin endpoints don't need to refresh auth cookies.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: advisorAssignments } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("role_key", "advisor")
    .is("term_id", null)
    .is("ends_at", null)
    .limit(1);

  if ((advisorAssignments?.length ?? 0) > 0) {
    return { ok: true, userId: user.id };
  }

  const { data: currentTerm } = await supabase.from("terms").select("id").eq("is_current", true).maybeSingle();

  if (!currentTerm?.id) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  const { data: presidentAssignments } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("role_key", "president")
    .eq("term_id", currentTerm.id)
    .is("ends_at", null)
    .limit(1);

  if ((presidentAssignments?.length ?? 0) > 0) {
    return { ok: true, userId: user.id };
  }

  return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
}

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const admin = getSupabaseAdminClient();
  const { data: terms, error } = await admin
    .from("terms")
    .select("id,name,start_date,end_date,is_current,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ terms });
}

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const body = (await request.json().catch(() => null)) as null | {
    name?: unknown;
    start_date?: unknown;
    end_date?: unknown;
  };

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const start_date = typeof body?.start_date === "string" ? body.start_date : null;
  const end_date = typeof body?.end_date === "string" ? body.end_date : null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("terms")
    .insert({ name, start_date, end_date, is_current: false })
    .select("id,name,start_date,end_date,is_current")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ term: data });
}

export async function PATCH(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const body = (await request.json().catch(() => null)) as null | {
    termId?: unknown;
    is_current?: unknown;
    name?: unknown;
    start_date?: unknown;
    end_date?: unknown;
  };

  const termId = typeof body?.termId === "string" ? body.termId : "";
  if (!termId) {
    return NextResponse.json({ error: "termId is required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body?.name === "string") patch.name = body.name.trim();
  if (typeof body?.start_date === "string" || body?.start_date === null) patch.start_date = body.start_date;
  if (typeof body?.end_date === "string" || body?.end_date === null) patch.end_date = body.end_date;

  const setCurrent = body?.is_current === true;

  const admin = getSupabaseAdminClient();

  if (setCurrent) {
    const { error: clearErr } = await admin.from("terms").update({ is_current: false }).eq("is_current", true);
    if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });

    const { error: setErr } = await admin.from("terms").update({ is_current: true }).eq("id", termId);
    if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });
  }

  if (Object.keys(patch).length > 0) {
    const { error: patchErr } = await admin.from("terms").update(patch).eq("id", termId);
    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });
  }

  const { data: term, error } = await admin
    .from("terms")
    .select("id,name,start_date,end_date,is_current")
    .eq("id", termId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ term });
}

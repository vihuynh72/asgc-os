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
        // No-op
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

function isValidRoleKey(roleKey: string): roleKey is "advisor" | "president" | "officer" | "volunteer" {
  return ["advisor", "president", "officer", "volunteer"].includes(roleKey);
}

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const url = request.nextUrl;
  const termId = url.searchParams.get("termId");
  const scope = url.searchParams.get("scope");
  const activeOnly = url.searchParams.get("activeOnly") === "1";
  const roleKeyFilter = url.searchParams.get("roleKey");

  const admin = getSupabaseAdminClient();

  let query = admin
    .from("role_assignments")
    .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary")
    .order("starts_at", { ascending: false });

  if (activeOnly) {
    query = query.is("ends_at", null);
  }

  if (roleKeyFilter && isValidRoleKey(roleKeyFilter)) {
    query = query.eq("role_key", roleKeyFilter);
  }

  if (scope === "global") {
    query = query.is("term_id", null);
  } else if (termId) {
    query = query.eq("term_id", termId);
  }

  const { data: assignments, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignments });
}

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const body = (await request.json().catch(() => null)) as null | {
    userId?: unknown;
    roleKey?: unknown;
    termId?: unknown;
  };

  const userId = typeof body?.userId === "string" ? body.userId : "";
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey : "";
  const termId = typeof body?.termId === "string" ? body.termId : null;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!roleKey || !isValidRoleKey(roleKey)) {
    return NextResponse.json({ error: "invalid roleKey" }, { status: 400 });
  }

  if (roleKey !== "advisor" && !termId) {
    return NextResponse.json({ error: "termId is required for term-scoped roles" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const insertRow: Record<string, unknown> = {
    user_id: userId,
    role_key: roleKey,
    term_id: roleKey === "advisor" ? null : termId,
    starts_at: new Date().toISOString(),
    ends_at: null,
    is_primary: false,
  };

  const { data: assignment, error } = await admin
    .from("role_assignments")
    .insert(insertRow)
    .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary")
    .single();

  if (error) {
    if (error.code === "23505") {
      let existingQuery = admin
        .from("role_assignments")
        .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary")
        .eq("user_id", userId)
        .eq("role_key", roleKey)
        .is("ends_at", null)
        .order("starts_at", { ascending: false })
        .limit(1);

      if (roleKey === "advisor") {
        existingQuery = existingQuery.is("term_id", null);
      } else if (termId) {
        existingQuery = existingQuery.eq("term_id", termId);
      }

      const { data: existing } = await existingQuery.maybeSingle();
      if (existing) return NextResponse.json({ assignment: existing });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignment });
}

export async function DELETE(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const body = (await request.json().catch(() => null)) as null | {
    assignmentId?: unknown;
  };

  const assignmentId = typeof body?.assignmentId === "string" ? body.assignmentId : "";
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("role_assignments")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .is("ends_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

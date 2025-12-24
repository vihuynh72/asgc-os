import { NextResponse, type NextRequest } from "next/server";

import { requireFullAdmin } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// GET: List terms (full admin only)
export async function GET(request: NextRequest) {
  const authz = await requireFullAdmin(request);
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

// POST: Create term (full admin only)
export async function POST(request: NextRequest) {
  const authz = await requireFullAdmin(request);
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

  // Best-effort audit log (server-only)
  await admin.rpc("log_event", {
    action_key: "term.created",
    actor_user_id: authz.userId,
    target_type: "term",
    target_id: data.id,
    metadata: { name: data.name },
  });

  return NextResponse.json({ term: data });
}

// PATCH: Update term (full admin only)
export async function PATCH(request: NextRequest) {
  const authz = await requireFullAdmin(request);
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
    const { error: setErr } = await admin.rpc("set_current_term", { term_id: termId });
    if (setErr) return NextResponse.json({ error: setErr.message }, { status: 500 });

    // Best-effort audit log (server-only)
    await admin.rpc("log_event", {
      action_key: "term.set_current",
      actor_user_id: authz.userId,
      target_type: "term",
      target_id: termId,
      metadata: {},
    });
  }

  if (Object.keys(patch).length > 0) {
    const { error: patchErr } = await admin.from("terms").update(patch).eq("id", termId);
    if (patchErr) return NextResponse.json({ error: patchErr.message }, { status: 500 });

    // Best-effort audit log (server-only)
    await admin.rpc("log_event", {
      action_key: "term.updated",
      actor_user_id: authz.userId,
      target_type: "term",
      target_id: termId,
      metadata: patch,
    });
  }

  const { data: term, error } = await admin
    .from("terms")
    .select("id,name,start_date,end_date,is_current")
    .eq("id", termId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ term });
}

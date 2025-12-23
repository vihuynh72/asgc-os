import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function isAdminForRequest(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
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

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}

const RolloverSchema = z.object({
  from_term_id: z.string().uuid(),
  to_term_id: z.string().uuid(),
  end_prior: z.boolean().optional(),
  set_current: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = RolloverSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { from_term_id, to_term_id, end_prior, set_current } = parsed.data;
  if (from_term_id === to_term_id) {
    return NextResponse.json({ error: "terms_must_differ" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: fromAssignments, error: fromErr } = await admin
    .from("role_assignments")
    .select("user_id,role_key,is_primary")
    .eq("term_id", from_term_id)
    .is("ends_at", null);

  if (fromErr) {
    return NextResponse.json({ error: fromErr.message }, { status: 500 });
  }

  const { data: toAssignments, error: toErr } = await admin
    .from("role_assignments")
    .select("user_id,role_key")
    .eq("term_id", to_term_id)
    .is("ends_at", null);

  if (toErr) {
    return NextResponse.json({ error: toErr.message }, { status: 500 });
  }

  const existingKeys = new Set((toAssignments ?? []).map((row) => `${row.user_id}:${row.role_key}`));
  const toInsert = (fromAssignments ?? []).filter(
    (row) => !existingKeys.has(`${row.user_id}:${row.role_key}`),
  );

  if (toInsert.length > 0) {
    const { error: insertErr } = await admin.from("role_assignments").insert(
      toInsert.map((row) => ({
        user_id: row.user_id,
        role_key: row.role_key,
        term_id: to_term_id,
        starts_at: new Date().toISOString(),
        ends_at: null,
        is_primary: row.is_primary ?? false,
      })),
    );

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  if (end_prior) {
    const { error: endErr } = await admin
      .from("role_assignments")
      .update({ ends_at: new Date().toISOString() })
      .eq("term_id", from_term_id)
      .is("ends_at", null);

    if (endErr) {
      return NextResponse.json({ error: endErr.message }, { status: 500 });
    }
  }

  if (set_current) {
    const { error: setErr } = await admin.rpc("set_current_term", { term_id: to_term_id });
    if (setErr) {
      return NextResponse.json({ error: setErr.message }, { status: 500 });
    }
  }

  await admin.rpc("log_event", {
    action_key: "terms.rollover",
    actor_user_id: authz.userId,
    target_type: "term",
    target_id: to_term_id,
    metadata: {
      from_term_id,
      to_term_id,
      end_prior: !!end_prior,
      set_current: !!set_current,
      inserted_count: toInsert.length,
    },
  });

  return NextResponse.json({ ok: true, inserted_count: toInsert.length });
}

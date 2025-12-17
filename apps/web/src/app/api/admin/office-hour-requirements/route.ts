import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RequirementRow = {
  id: string;
  role_key: string;
  term_id: string | null;
  weekly_total_hours: number;
  weekly_in_office_hours: number;
  effective_start: string | null;
  effective_end: string | null;
};

async function isAdminForRequest(
  request: NextRequest,
): Promise<
  | { ok: true; userId: string; supabase: ReturnType<typeof createServerClient> }
  | { ok: false; response: NextResponse }
> {
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

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, supabase };
}

const PutSchema = z.object({
  termId: z.string().uuid(),
  requirements: z
    .array(
      z.object({
        roleKey: z.string().min(1),
        weeklyTotalHours: z.number().int().min(0),
        weeklyInOfficeHours: z.number().int().min(0),
      }),
    )
    .min(1),
});

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const url = request.nextUrl;
  const termId = url.searchParams.get("termId");

  const admin = getSupabaseAdminClient();

  const { data: currentTerm, error: termErr } = await admin
    .from("terms")
    .select("id")
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (termErr) return NextResponse.json({ error: termErr.message }, { status: 500 });

  const resolvedTermId = termId ?? currentTerm?.id;
  if (!resolvedTermId) {
    return NextResponse.json({ error: "no term" }, { status: 400 });
  }

  const { data: requirements, error: reqErr } = await admin
    .from("office_hour_requirements")
    .select("id,role_key,term_id,weekly_total_hours,weekly_in_office_hours,effective_start,effective_end")
    .or(`term_id.eq.${resolvedTermId},term_id.is.null`)
    .order("created_at", { ascending: true });

  if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 });

  return NextResponse.json({ termId: resolvedTermId, requirements: (requirements ?? []) as RequirementRow[] });
}

export async function PUT(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { termId, requirements } = parsed.data;

  // Enforce invariant early for friendlier errors.
  for (const r of requirements) {
    if (r.weeklyInOfficeHours > r.weeklyTotalHours) {
      return NextResponse.json({ error: "in-office hours cannot exceed total hours" }, { status: 400 });
    }
  }

  const admin = getSupabaseAdminClient();

  // Upsert the "default" row for each role_key for this term (effective_* = NULL).
  // We avoid PostgREST upsert here because Postgres cannot use a partial unique index
  // as an ON CONFLICT target. Instead we do update-then-insert.
  for (const r of requirements) {
    const patch = {
      weekly_total_hours: r.weeklyTotalHours,
      weekly_in_office_hours: r.weeklyInOfficeHours,
    };

    const { data: updatedRows, error: updateErr } = await admin
      .from("office_hour_requirements")
      .update(patch)
      .eq("role_key", r.roleKey)
      .eq("term_id", termId)
      .is("effective_start", null)
      .is("effective_end", null)
      .select("id")
      .limit(1);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    if (!updatedRows || updatedRows.length === 0) {
      const { error: insertErr } = await admin
        .from("office_hour_requirements")
        .insert({
          role_key: r.roleKey,
          term_id: termId,
          weekly_total_hours: r.weeklyTotalHours,
          weekly_in_office_hours: r.weeklyInOfficeHours,
          effective_start: null,
          effective_end: null,
        });

      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await admin.rpc("log_event", {
      action_key: "office_hour_requirements.saved",
      actor_user_id: authz.userId,
      target_type: "office_hour_requirements",
      target_id: `${termId}:${r.roleKey}`,
      metadata: {
        term_id: termId,
        role_key: r.roleKey,
        weekly_total_hours: r.weeklyTotalHours,
        weekly_in_office_hours: r.weeklyInOfficeHours,
      },
    });
  }

  const { data: updated, error: readErr } = await admin
    .from("office_hour_requirements")
    .select("id,role_key,term_id,weekly_total_hours,weekly_in_office_hours,effective_start,effective_end")
    .eq("term_id", termId)
    .is("effective_start", null)
    .is("effective_end", null)
    .order("role_key", { ascending: true });

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  return NextResponse.json({ termId, requirements: (updated ?? []) as RequirementRow[] });
}

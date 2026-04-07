import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireOfficeHoursAdmin } from "@/lib/adminAuth";
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

const PutSchema = z.object({
  termId: z.string().uuid(),
  requirements: z
    .array(
      z.object({
        roleKey: z.string().min(1),
        weeklyTotalHours: z.number().int().min(0),
        weeklyInOfficeHours: z.number().int().min(0).optional(),
      }),
    )
    .min(1),
});

// GET: Read office hour requirements (Office Hours full admin + EVP only)
export async function GET(request: NextRequest) {
  const authz = await requireOfficeHoursAdmin(request);
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

// PUT: Update office hour requirements (Office Hours full admin + EVP only)
export async function PUT(request: NextRequest) {
  const authz = await requireOfficeHoursAdmin(request);
  if (!authz.ok) return authz.response;

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { termId, requirements } = parsed.data;

  const admin = getSupabaseAdminClient();

  // Upsert the "default" row for each role_key for this term (effective_* = NULL).
  // We avoid PostgREST upsert here because Postgres cannot use a partial unique index
  // as an ON CONFLICT target. Instead we do update-then-insert.
  for (const r of requirements) {
    const patch = {
      weekly_total_hours: r.weeklyTotalHours,
      weekly_in_office_hours: 0,
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
          weekly_in_office_hours: 0,
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
        weekly_in_office_hours: 0,
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

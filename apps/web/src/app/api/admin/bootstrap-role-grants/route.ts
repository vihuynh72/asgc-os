import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RoleKey = "advisor" | "president" | "executive" | "director" | "board_member" | "volunteer";

const ROLE_SCOPES: Record<RoleKey, "global" | "term"> = {
  advisor: "global",
  president: "term",
  executive: "term",
  director: "term",
  board_member: "term",
  volunteer: "term",
};

type BootstrapRoleGrantRow = {
  id: string;
  email: string;
  email_normalized: string;
  role_key: RoleKey;
  term_id: string | null;
  is_active: boolean;
  consumed_at: string | null;
  created_at: string;
  notes: string | null;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

async function isAdminForRequest(
  request: NextRequest,
): Promise<{ ok: true; userId: string; supabase: ReturnType<typeof createServerClient> } | { ok: false; response: NextResponse }> {
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

  return { ok: true, userId: user.id, supabase };
}

function clampLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : 200;
  if (!Number.isFinite(n)) return 200;
  return Math.max(1, Math.min(1000, Math.floor(n)));
}

const QuerySchema = z.object({
  email: z.string().email().transform(normalizeEmail).optional(),
  includeInactive: z.enum(["0", "1"]).optional(),
  includeConsumed: z.enum(["0", "1"]).optional(),
  limit: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = QuerySchema.safeParse({
    email: request.nextUrl.searchParams.get("email") ?? undefined,
    includeInactive: request.nextUrl.searchParams.get("includeInactive") ?? undefined,
    includeConsumed: request.nextUrl.searchParams.get("includeConsumed") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { email, includeInactive, includeConsumed, limit } = parsed.data;
  const max = clampLimit(limit);

  let query = admin
    .from("bootstrap_role_grants")
    .select("id,email,email_normalized,role_key,term_id,is_active,consumed_at,created_at,notes")
    .order("created_at", { ascending: false })
    .limit(max);

  if (email) query = query.eq("email_normalized", email);
  if (includeInactive !== "1") query = query.eq("is_active", true);
  if (includeConsumed !== "1") query = query.is("consumed_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ grants: (data ?? []) as BootstrapRoleGrantRow[] });
}

const CreateSchema = z.object({
  email: z.string().email().transform(normalizeEmail),
  roleKey: z.enum(["advisor", "president", "executive", "director", "board_member", "volunteer"]),
  termId: z.string().uuid().nullable().optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { email, roleKey, termId, notes } = parsed.data;
  const scope = ROLE_SCOPES[roleKey];
  let resolvedTermId: string | null | undefined = termId;

  if (scope === "global") {
    if (termId && termId.length > 0) {
      return NextResponse.json({ error: "global_role_must_have_null_term" }, { status: 400 });
    }
    resolvedTermId = null;
  } else if (termId === undefined) {
    const { data: termRow, error: termErr } = await admin
      .from("terms")
      .select("id")
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();

    if (termErr) return NextResponse.json({ error: termErr.message }, { status: 500 });
    if (!termRow?.id) return NextResponse.json({ error: "no_current_term" }, { status: 400 });
    resolvedTermId = termRow.id as string;
  }

  let existing = admin
    .from("bootstrap_role_grants")
    .select("id,email,email_normalized,role_key,term_id,is_active,consumed_at,created_at,notes")
    .eq("email_normalized", email)
    .eq("role_key", roleKey)
    .eq("is_active", true)
    .is("consumed_at", null)
    .limit(1);

  if (resolvedTermId === null) existing = existing.is("term_id", null);
  else existing = existing.eq("term_id", resolvedTermId);

  const { data: existingRow, error: existingErr } = await existing.maybeSingle();
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existingRow) {
    if (typeof notes === "string") {
      const normalizedNotes = notes.trim().length > 0 ? notes.trim() : null;
      const currentNotes = (existingRow as BootstrapRoleGrantRow).notes ?? null;
      if (normalizedNotes !== currentNotes) {
        const { data: updated, error: updateErr } = await admin
          .from("bootstrap_role_grants")
          .update({ notes: normalizedNotes })
          .eq("id", (existingRow as BootstrapRoleGrantRow).id)
          .select("id,email,email_normalized,role_key,term_id,is_active,consumed_at,created_at,notes")
          .single();

        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
        return NextResponse.json({ grant: updated as BootstrapRoleGrantRow });
      }
    }

    return NextResponse.json({ grant: existingRow as BootstrapRoleGrantRow });
  }

  const normalizedNotes = typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null;
  const { data: inserted, error: insertErr } = await admin
    .from("bootstrap_role_grants")
    .insert({
      email,
      role_key: roleKey,
      term_id: resolvedTermId ?? null,
      is_active: true,
      notes: normalizedNotes,
    })
    .select("id,email,email_normalized,role_key,term_id,is_active,consumed_at,created_at,notes")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ grant: inserted as BootstrapRoleGrantRow });
}

const UpdateSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const patch: Record<string, unknown> = {};

  if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  const { data, error } = await admin
    .from("bootstrap_role_grants")
    .update(patch)
    .eq("id", parsed.data.id)
    .select("id,email,email_normalized,role_key,term_id,is_active,consumed_at,created_at,notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ grant: data as BootstrapRoleGrantRow });
}

const DeleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("bootstrap_role_grants").delete().eq("id", parsed.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

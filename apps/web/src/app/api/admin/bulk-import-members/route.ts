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

const RoleKeySchema = z.enum(["advisor", "president", "executive", "director", "board_member", "volunteer"]);

const EntrySchema = z.object({
  email: z.string().email(),
  role_key: RoleKeySchema.optional(),
  term_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const BulkImportSchema = z.object({
  entries: z.array(EntrySchema).min(1),
});

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = BulkImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const entries = parsed.data.entries.map((entry) => ({
    email: entry.email.trim().toLowerCase(),
    role_key: entry.role_key,
    term_id: entry.term_id ?? null,
    notes: entry.notes?.trim() ?? null,
  }));

  const currentTermRes = await admin.rpc("current_term_id");
  if (currentTermRes.error) {
    return NextResponse.json({ error: currentTermRes.error.message }, { status: 500 });
  }
  const currentTermId = typeof currentTermRes.data === "string" ? currentTermRes.data : null;

  const allowlistRows = entries.map((entry) => ({
    email: entry.email,
    is_active: true,
    invited_by: authz.userId,
    revoked_at: null,
    notes: entry.notes,
  }));

  const { error: allowlistErr } = await admin
    .from("invites_allowlist")
    .upsert(allowlistRows, { onConflict: "email_normalized" });

  if (allowlistErr) {
    return NextResponse.json({ error: allowlistErr.message }, { status: 500 });
  }

  const grantRows = entries
    .filter((entry) => entry.role_key)
    .map((entry) => {
      const isAdvisor = entry.role_key === "advisor";
      return {
        email: entry.email,
        role_key: entry.role_key,
        term_id: isAdvisor ? null : entry.term_id ?? currentTermId,
        notes: entry.notes,
        is_active: true,
      };
    })
    .filter((entry) => entry.role_key && (entry.term_id || entry.role_key === "advisor"));

  if (grantRows.length > 0) {
    const { error: grantErr } = await admin
      .from("bootstrap_role_grants")
      .upsert(grantRows, { onConflict: "email_normalized,role_key,term_id" });

    if (grantErr) {
      return NextResponse.json({ error: grantErr.message }, { status: 500 });
    }
  }

  await admin.rpc("log_event", {
    action_key: "admin.bulk_import_members",
    actor_user_id: authz.userId,
    target_type: "bulk_import",
    target_id: null,
    metadata: { count: entries.length, role_grants: grantRows.length },
  });

  return NextResponse.json({ ok: true, allowlist_count: entries.length, role_grants: grantRows.length });
}

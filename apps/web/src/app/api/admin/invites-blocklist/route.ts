import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type InviteBlocklistRow = {
  id: string;
  pattern: string;
  pattern_normalized: string;
  is_active: boolean;
  banned_by: string | null;
  banned_at: string;
  unbanned_at: string | null;
  notes: string | null;
};

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

function normalizeEntry(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizePattern(raw: string): string {
  const normalized = normalizeEntry(raw);
  if (z.string().email().safeParse(normalized).success) return normalized;
  if (normalized.startsWith("@")) return normalized;
  if (isValidDomain(normalized)) return `@${normalized}`;
  return normalized;
}

function isValidDomain(domain: string): boolean {
  if (!domain) return false;
  if (domain.includes("@")) return false;
  if (domain.includes(" ")) return false;
  // Minimal "dns-ish" check; keep permissive but safe.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

function isValidPattern(value: string): boolean {
  if (z.string().email().safeParse(value).success) return true;
  if (value.startsWith("@")) return isValidDomain(value.slice(1));
  return false;
}

const CreateSchema = z.object({
  pattern: z
    .string()
    .min(3)
    .transform(normalizePattern)
    .refine(isValidPattern, { message: "invalid_pattern" }),
  notes: z.string().optional(),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
  notes: z.string().nullable().optional(),
});

const DeleteSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("invites_blocklist")
    .select("id,pattern,pattern_normalized,is_active,banned_by,banned_at,unbanned_at,notes")
    .order("is_active", { ascending: false })
    .order("banned_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bans: (data ?? []) as InviteBlocklistRow[] });
}

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { pattern, notes } = parsed.data;

  const { error: upsertErr } = await admin
    .from("invites_blocklist")
    .upsert(
      {
        pattern,
        is_active: true,
        unbanned_at: null,
        banned_by: authz.userId,
        notes: typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null,
      },
      { onConflict: "pattern_normalized" },
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { data: row, error: readErr } = await admin
    .from("invites_blocklist")
    .select("id,pattern,pattern_normalized,is_active,banned_by,banned_at,unbanned_at,notes")
    .eq("pattern_normalized", pattern)
    .single();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  return NextResponse.json({ ban: row as InviteBlocklistRow });
}

export async function PATCH(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { id, is_active, notes } = parsed.data;

  const patch: Record<string, unknown> = {
    is_active,
    unbanned_at: is_active ? null : new Date().toISOString(),
  };
  if (notes !== undefined) patch.notes = notes;

  const { data: row, error: updateErr } = await admin
    .from("invites_blocklist")
    .update(patch)
    .eq("id", id)
    .select("id,pattern,pattern_normalized,is_active,banned_by,banned_at,unbanned_at,notes")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ban: row as InviteBlocklistRow });
}

export async function DELETE(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("invites_blocklist").delete().eq("id", parsed.data.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

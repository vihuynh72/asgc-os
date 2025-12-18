import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type InviteAllowlistRow = {
  id: string;
  email: string;
  email_normalized: string;
  is_active: boolean;
  invited_by: string | null;
  invited_at: string;
  revoked_at: string | null;
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

function isValidDomain(domain: string): boolean {
  if (!domain) return false;
  if (domain.includes("@")) return false;
  if (domain.includes(" ")) return false;
  // Minimal "dns-ish" check; keep permissive but safe.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

function isValidAllowlistEntry(value: string): boolean {
  if (z.string().email().safeParse(value).success) return true;
  if (value.startsWith("@")) return isValidDomain(value.slice(1));
  return false;
}

const CreateSchema = z.object({
  email: z
    .string()
    .min(3)
    .transform(normalizeEntry)
    .refine(isValidAllowlistEntry, { message: "invalid_email" }),
  notes: z.string().optional(),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("invites_allowlist")
    .select("id,email,email_normalized,is_active,invited_by,invited_at,revoked_at,notes")
    .order("invited_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invites: (data ?? []) as InviteAllowlistRow[] });
}

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { email, notes } = parsed.data;

  const { error: upsertErr } = await admin
    .from("invites_allowlist")
    .upsert(
      {
        email,
        is_active: true,
        revoked_at: null,
        invited_by: authz.userId,
        notes: typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : null,
      },
      { onConflict: "email_normalized" },
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  const { data: row, error: readErr } = await admin
    .from("invites_allowlist")
    .select("id,email,email_normalized,is_active,invited_by,invited_at,revoked_at,notes")
    .eq("email_normalized", email)
    .single();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  return NextResponse.json({ invite: row as InviteAllowlistRow });
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
    revoked_at: is_active ? null : new Date().toISOString(),
  };
  if (notes !== undefined) patch.notes = notes;

  const { data: row, error: updateErr } = await admin
    .from("invites_allowlist")
    .update(patch)
    .eq("id", id)
    .select("id,email,email_normalized,is_active,invited_by,invited_at,revoked_at,notes")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ invite: row as InviteAllowlistRow });
}


import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFullAdmin } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type InviteAllowlistRow = {
  id: string;
  email: string;
  email_normalized: string;
  sort_order: number;
  is_active: boolean;
  invited_by: string | null;
  invited_at: string;
  revoked_at: string | null;
  notes: string | null;
};

async function syncProfileDisplayNameForAllowlistedEmail(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  emailNormalized: string,
  notes: string | null | undefined,
) {
  if (!emailNormalized || emailNormalized.startsWith("@")) return;
  if (notes === undefined) return;

  const { data: privateRow, error: privateErr } = await admin
    .from("profile_private")
    .select("id")
    .eq("email", emailNormalized)
    .limit(1)
    .maybeSingle();

  if (privateErr || !privateRow?.id) return;

  const nextName = notes === null ? null : notes.trim();

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ display_name: nextName && nextName.length > 0 ? nextName : null })
    .eq("id", privateRow.id);

  if (profileErr) {
    console.error("[admin] failed to sync profile display_name from allowlist notes", {
      email: emailNormalized,
      message: profileErr.message,
    });
  }
}

function normalizeEntry(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeAllowlistEntry(raw: string): string {
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

function isValidAllowlistEntry(value: string): boolean {
  if (z.string().email().safeParse(value).success) return true;
  if (value.startsWith("@")) return isValidDomain(value.slice(1));
  return false;
}

const CreateSchema = z.object({
  email: z
    .string()
    .min(3)
    .transform(normalizeAllowlistEntry)
    .refine(isValidAllowlistEntry, { message: "invalid_email" }),
  notes: z.string().optional(),
});

const UpdateSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
  notes: z.string().nullable().optional(),
});

// GET: List allowlist entries (full admin only)
export async function GET(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("invites_allowlist")
    .select("id,email,email_normalized,sort_order,is_active,invited_by,invited_at,revoked_at,notes")
    .order("sort_order", { ascending: false })
    .order("invited_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invites: (data ?? []) as InviteAllowlistRow[] });
}

// POST: Add to allowlist (full admin only)
export async function POST(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
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
    .select("id,email,email_normalized,sort_order,is_active,invited_by,invited_at,revoked_at,notes")
    .eq("email_normalized", email)
    .single();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const normalizedNotes = typeof notes === "string" ? (notes.trim().length > 0 ? notes.trim() : null) : undefined;
  await syncProfileDisplayNameForAllowlistedEmail(admin, email, normalizedNotes);

  return NextResponse.json({ invite: row as InviteAllowlistRow });
}

// PATCH: Update allowlist entry (full admin only)
export async function PATCH(request: NextRequest) {
  const authz = await requireFullAdmin(request);
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
    .select("id,email,email_normalized,sort_order,is_active,invited_by,invited_at,revoked_at,notes")
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await syncProfileDisplayNameForAllowlistedEmail(admin, (row as InviteAllowlistRow).email_normalized, notes);

  return NextResponse.json({ invite: row as InviteAllowlistRow });
}

const DeleteSchema = z.object({
  id: z.string().uuid(),
});

// DELETE: Remove from allowlist (full admin only)
export async function DELETE(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const parsed = DeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("invites_allowlist").delete().eq("id", parsed.data.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

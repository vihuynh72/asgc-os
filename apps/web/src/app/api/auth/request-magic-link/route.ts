import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
});

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const redirectTo = `${origin}/auth/callback`;

  let email: string;
  try {
    const body = BodySchema.parse(await req.json());
    email = normalizeEmail(body.email);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Security posture: invite-only. We do NOT reveal allowlist membership.
  // If not allowlisted, we respond with a generic ok.
  const admin = getSupabaseAdminClient();

  const { data: allowlisted, error: allowlistError } = await admin
    .from("invites_allowlist")
    .select("id")
    .eq("email_normalized", email)
    .eq("is_active", true)
    .maybeSingle();

  if (allowlistError || !allowlisted) {
    return NextResponse.json({ ok: true });
  }

  // Best-practice flow:
  // - If the user doesn't exist yet: send an invite email (admin-only, still internal).
  // - If the user exists: send a standard OTP/magic link.
  const inviteRes = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (inviteRes.error) {
    // User probably already exists; fall back to sending a magic link via the public client.
    const env = getPublicEnv();
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    await anon.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

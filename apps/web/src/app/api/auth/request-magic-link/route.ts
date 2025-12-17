import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().optional(),
});

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;

  let email: string;
  let postAuthRedirectTo: string | undefined;
  try {
    const body = BodySchema.parse(await request.json());
    email = normalizeEmail(body.email);
    postAuthRedirectTo =
      typeof body.redirectTo === "string" && body.redirectTo.startsWith("/") ? body.redirectTo : undefined;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const callbackUrl = new URL("/auth/callback", origin);
  if (postAuthRedirectTo) callbackUrl.searchParams.set("redirectTo", postAuthRedirectTo);
  const emailRedirectTo = callbackUrl.toString();

  // Security posture: invite-only. We do NOT reveal allowlist membership.
  // If not allowlisted, we respond with a generic ok.
  const admin = getSupabaseAdminClient();

  const { data: allowlisted, error: allowlistError } = await admin
    .from("invites_allowlist")
    .select("id")
    .eq("email_normalized", email)
    .eq("is_active", true)
    .maybeSingle();

  if (allowlistError) {
    console.error("[auth] allowlist lookup failed", { message: allowlistError.message });
  }

  if (allowlistError || !allowlisted) {
    return NextResponse.json({ ok: true });
  }

  // Best-practice flow:
  // - If the user doesn't exist yet: send an invite email (admin-only, still internal).
  // - If the user exists: send a standard OTP/magic link.
  const inviteRes = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: emailRedirectTo,
  });

  if (inviteRes.error) {
    console.error("[auth] inviteUserByEmail failed; falling back to OTP", {
      message: inviteRes.error.message,
    });
    // User probably already exists; fall back to sending a magic link via a stateless client.
    // We intentionally avoid PKCE here so the link works even if opened in another browser/device;
    // the callback uses token_hash verification to establish the session server-side.
    const env = getPublicEnv();
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const otpRes = await anon.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: emailRedirectTo,
        // Preserve invite-only posture: OTP fallback should not create new users.
        shouldCreateUser: false,
      },
    });

    if (otpRes.error) {
      console.error("[auth] signInWithOtp failed", { message: otpRes.error.message });
    }
  }

  return NextResponse.json({ ok: true });
}

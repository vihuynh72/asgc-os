import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { FIRST_TIME_SIGNIN_CHALLENGE_KIND } from "@/lib/auth/auth-code-email.mjs";
import { getServerEnv } from "@/lib/envServer";
import { getPublicEnv } from "@/lib/env";
import { verifyLoginEmailChallengeCode } from "@/lib/auth/password-signin.mjs";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { POST_AUTH_REDIRECT_COOKIE, safePostAuthRedirectPath } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(4),
  redirectTo: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let email: string;
  let token: string;
  let redirectTo: string;

  try {
    const body = BodySchema.parse(await request.json());
    email = normalizeEmail(body.email);
    token = body.token.trim();
    redirectTo = safePostAuthRedirectPath(body.redirectTo);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Defense-in-depth: require allowlist membership even if a user obtained an OTP through other means.
  const admin = getSupabaseAdminClient();
  const { data: allowlisted, error: allowlistError } = await admin.rpc("is_email_allowlisted", { _email: email });

  if (allowlistError) {
    console.error("[auth] is_email_allowlisted failed", { message: allowlistError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!allowlisted) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const env = getPublicEnv();
  const serverEnv = getServerEnv();
  const { data: challenge, error: challengeError } = await admin
    .from("login_email_challenges")
    .select("id,user_id,email,challenge_kind,code_hash,attempt_count,expires_at,consumed_at,redirect_to,supabase_token_hash,supabase_verification_type")
    .eq("email", email)
    .eq("challenge_kind", FIRST_TIME_SIGNIN_CHALLENGE_KIND)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (challengeError) {
    console.error("[auth] login_email_challenges lookup failed", { message: challengeError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!challenge || Date.parse(challenge.expires_at) <= Date.now()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const validCode = verifyLoginEmailChallengeCode({
    challengeId: challenge.id,
    code: token,
    hash: challenge.code_hash,
    secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!validCode) {
    await admin
      .from("login_email_challenges")
      .update({ attempt_count: Math.max(0, Number(challenge.attempt_count) || 0) + 1 })
      .eq("id", challenge.id);
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const resolvedRedirectTo = safePostAuthRedirectPath(challenge.redirect_to ?? redirectTo);
  const response = NextResponse.json({ ok: true, redirectTo: resolvedRedirectTo });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    type: challenge.supabase_verification_type,
    token_hash: challenge.supabase_token_hash,
  });

  if (error) {
    console.error("[auth] verifyOtp (token_hash) failed", {
      message: error.message,
      verificationType: challenge.supabase_verification_type,
    });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    await supabase.rpc("consume_bootstrap_role_grants");
  } catch {
    // Ignore (RPC may not exist yet).
  }

  await admin
    .from("login_email_challenges")
    .update({
      attempt_count: Math.max(0, Number(challenge.attempt_count) || 0),
      consumed_at: new Date().toISOString(),
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", challenge.id);

  response.cookies.set(POST_AUTH_REDIRECT_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  PENDING_PASSWORD_LOGIN_COOKIE,
  readPendingPasswordLogin,
  verifyLoginEmailChallengeCode,
} from "@/lib/auth/password-signin.mjs";
import { normalizeOtpCode } from "@/lib/auth/first-time-signin-flow.mjs";
import { issueTrustedDevice } from "@/lib/auth/trusted-device-server.mjs";
import { getServerEnv } from "@/lib/envServer";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { POST_AUTH_REDIRECT_COOKIE, safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClientWithResponse } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
  trustDevice: z.boolean().optional(),
  redirectTo: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let email: string;
  let code: string;
  let trustDevice = false;
  let redirectTo: string;

  try {
    const body = BodySchema.parse(await request.json());
    email = normalizeEmail(body.email);
    code = normalizeOtpCode(body.code);
    trustDevice = Boolean(body.trustDevice);
    const safeRedirect = safeRedirectPathOrNull(body.redirectTo);
    redirectTo = safePostAuthRedirectPath(safeRedirect ?? "/dashboard");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (code.length !== 6) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const serverEnv = getServerEnv();
  const pending = readPendingPasswordLogin({
    value: request.cookies.get(PENDING_PASSWORD_LOGIN_COOKIE)?.value ?? null,
    secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!pending || pending.email !== email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: challenge, error: challengeError } = await admin
    .from("login_email_challenges")
    .select("id,user_id,email,code_hash,attempt_count,expires_at,consumed_at")
    .eq("id", pending.challengeId)
    .eq("user_id", pending.userId)
    .eq("email", email)
    .maybeSingle();

  if (challengeError) {
    console.error("[auth] login_email_challenges lookup failed", { message: challengeError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!challenge || challenge.consumed_at || Date.parse(challenge.expires_at) <= Date.now()) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const validCode = verifyLoginEmailChallengeCode({
    challengeId: challenge.id,
    code,
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

  const response = NextResponse.json({
    ok: true,
    redirectTo: safePostAuthRedirectPath(pending.redirectTo || redirectTo),
  });
  const supabase = getSupabaseRouteHandlerClientWithResponse(request, response);
  const { error: setSessionError } = await supabase.auth.setSession({
    access_token: pending.accessToken,
    refresh_token: pending.refreshToken,
  });

  if (setSessionError) {
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

  if (trustDevice) {
    await issueTrustedDevice({
      admin,
      response,
      userId: pending.userId,
      userAgent: request.headers.get("user-agent"),
      secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    });
  }

  response.cookies.set(PENDING_PASSWORD_LOGIN_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(POST_AUTH_REDIRECT_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

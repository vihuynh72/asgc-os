import { randomInt, randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  PASSWORD_SIGNIN_CHALLENGE_KIND,
  AUTH_CODE_EMAIL_TTL_MINUTES,
  buildAuthCodeEmail,
} from "@/lib/auth/auth-code-email.mjs";
import {
  PENDING_PASSWORD_LOGIN_COOKIE,
  buildLoginEmailChallengeExpiry,
  hashLoginEmailChallengeCode,
  sealPendingPasswordLogin,
} from "@/lib/auth/password-signin.mjs";
import { TRUSTED_DEVICE_COOKIE, buildTrustedDeviceExpiry, hashTrustedDeviceToken } from "@/lib/auth/trusted-device.mjs";
import { sendEmail } from "@/lib/emailSender";
import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/envServer";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { POST_AUTH_REDIRECT_COOKIE, safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { copySupabaseResponseState } from "@/lib/supabase-response-headers.mjs";
import { getSupabaseRouteHandlerClientWithResponse } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const TRUSTED_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const EMAIL_CHALLENGE_MAX_AGE_SECONDS = 60 * 15;

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  redirectTo: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let email: string;
  let password: string;
  let redirectTo: string;

  try {
    const body = BodySchema.parse(await request.json());
    email = normalizeEmail(body.email);
    password = body.password;
    const safeRedirect = safeRedirectPathOrNull(body.redirectTo);
    redirectTo = safePostAuthRedirectPath(safeRedirect ?? "/dashboard");
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Security posture: invite-only. For auth endpoints, keep responses generic.
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
  const ephemeral = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: signInData, error } = await ephemeral.auth.signInWithPassword({ email, password });
  const session = signInData.session;
  const user = signInData.user;
  if (error || !session || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const trustedDeviceToken = request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value ?? null;
  const userAgent = request.headers.get("user-agent");

  if (trustedDeviceToken) {
    const trustedTokenHash = hashTrustedDeviceToken({
      token: trustedDeviceToken,
      secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    });

    const { data: trustedDevice } = await admin
      .from("trusted_login_devices")
      .select("id,expires_at,revoked_at")
      .eq("user_id", user.id)
      .eq("token_hash", trustedTokenHash)
      .maybeSingle();

    const expiresAtMs = trustedDevice?.expires_at ? Date.parse(trustedDevice.expires_at) : Number.NaN;
    const trustedStillValid = Boolean(
      trustedDevice?.id && !trustedDevice?.revoked_at && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now(),
    );

    if (trustedStillValid && trustedDevice?.id) {
      const trustedDeviceId = trustedDevice.id;
      const refreshedExpiresAt = buildTrustedDeviceExpiry();
      const response = NextResponse.json({ ok: true, redirectTo });
      const supabase = getSupabaseRouteHandlerClientWithResponse(request, response);
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });

      if (setSessionError) {
        const errorResponse = NextResponse.json({ ok: false }, { status: 401 });
        copySupabaseResponseState(response, errorResponse);
        return errorResponse;
      }

      try {
        await supabase.rpc("consume_bootstrap_role_grants");
      } catch {
        // Ignore (RPC may not exist yet).
      }

      await admin
        .from("trusted_login_devices")
        .update({
          last_seen_at: new Date().toISOString(),
          expires_at: refreshedExpiresAt,
          user_agent: userAgent,
        })
        .eq("id", trustedDeviceId);

      response.cookies.set(TRUSTED_DEVICE_COOKIE, trustedDeviceToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
      });
      response.cookies.set(POST_AUTH_REDIRECT_COOKIE, "", { path: "/", maxAge: 0 });
      response.cookies.set(PENDING_PASSWORD_LOGIN_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }
  }

  const challengeCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = buildLoginEmailChallengeExpiry();
  const challengeId = randomUUID();
  const { error: challengeError } = await admin.from("login_email_challenges").insert({
    id: challengeId,
    user_id: user.id,
    email,
    code_hash: hashLoginEmailChallengeCode({
      challengeId,
      code: challengeCode,
      secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    }),
    redirect_to: redirectTo,
    request_ip: request.headers.get("x-forwarded-for") ?? null,
    user_agent: userAgent,
    expires_at: expiresAt,
  });

  if (challengeError) {
    console.error("[auth] login_email_challenges insert failed", { message: challengeError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, nextStep: "email_otp", redirectTo });
  const emailMessage = buildAuthCodeEmail({
    kind: PASSWORD_SIGNIN_CHALLENGE_KIND,
    code: challengeCode,
    expiresInMinutes: AUTH_CODE_EMAIL_TTL_MINUTES,
  });

  try {
    await sendEmail({
      to: email,
      subject: emailMessage.subject,
      text: emailMessage.text,
      html: emailMessage.html,
    });
  } catch (err) {
    console.error("[auth] sendEmail failed", { message: err instanceof Error ? err.message : "unknown_error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  response.cookies.set(PENDING_PASSWORD_LOGIN_COOKIE, sealPendingPasswordLogin({
    payload: {
      challengeId,
      userId: user.id,
      email,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      redirectTo,
    },
    secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
  }), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: EMAIL_CHALLENGE_MAX_AGE_SECONDS,
  });
  response.cookies.set(POST_AUTH_REDIRECT_COOKIE, redirectTo, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: EMAIL_CHALLENGE_MAX_AGE_SECONDS,
  });

  return response;
}

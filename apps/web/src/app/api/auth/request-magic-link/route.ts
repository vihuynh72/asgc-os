import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { sendEmail } from "@/lib/emailSender";
import { issueFirstTimeSignInCode } from "@/lib/auth/first-time-signin.server.mjs";
import { getServerEnv } from "@/lib/envServer";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { POST_AUTH_REDIRECT_COOKIE, safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let email: string;
  let postAuthRedirectTo: string | undefined;
  try {
    const body = BodySchema.parse(await request.json());
    email = normalizeEmail(body.email);
    const safeRedirect = safeRedirectPathOrNull(body.redirectTo);
    postAuthRedirectTo = safeRedirect ? safePostAuthRedirectPath(safeRedirect) : undefined;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  if (postAuthRedirectTo) {
    response.cookies.set(POST_AUTH_REDIRECT_COOKIE, postAuthRedirectTo, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 15,
    });
  }

  // Security posture: invite-only. We do NOT reveal allowlist membership.
  // If not allowlisted, we respond with a generic ok.
  const admin = getSupabaseAdminClient();
  const serverEnv = getServerEnv();

  const { data: allowlisted, error: allowlistError } = await admin.rpc("is_email_allowlisted", { _email: email });

  if (allowlistError) {
    console.error("[auth] is_email_allowlisted failed", { message: allowlistError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!allowlisted) {
    return response;
  }

  try {
    await issueFirstTimeSignInCode({
      admin,
      email,
      redirectTo: postAuthRedirectTo ?? "/dashboard",
      requestIp: request.headers.get("x-forwarded-for") ?? null,
      userAgent: request.headers.get("user-agent"),
      secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
      sendEmailFn: sendEmail,
    });
  } catch (err) {
    console.error("[auth] first-time sign-in email failed", { message: err instanceof Error ? err.message : "unknown_error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return response;
}

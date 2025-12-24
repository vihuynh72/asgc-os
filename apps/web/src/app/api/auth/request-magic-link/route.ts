import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { sendEmail } from "@/lib/emailSender";
import { generateSignInLink } from "@/lib/authLinks";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { POST_AUTH_REDIRECT_COOKIE, safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;

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

  const callbackUrl = new URL("/auth/callback", origin);
  if (postAuthRedirectTo) callbackUrl.searchParams.set("redirectTo", postAuthRedirectTo);
  const emailRedirectTo = callbackUrl.toString();

  // Security posture: invite-only. We do NOT reveal allowlist membership.
  // If not allowlisted, we respond with a generic ok.
  const admin = getSupabaseAdminClient();

  const { data: allowlisted, error: allowlistError } = await admin.rpc("is_email_allowlisted", { _email: email });

  if (allowlistError) {
    console.error("[auth] is_email_allowlisted failed", { message: allowlistError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!allowlisted) {
    return response;
  }

  let signInLink: Awaited<ReturnType<typeof generateSignInLink>>;
  try {
    signInLink = await generateSignInLink(admin, email, emailRedirectTo);
  } catch (err) {
    console.error("[auth] generateLink failed", { message: err instanceof Error ? err.message : "unknown_error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const callbackLink = new URL(emailRedirectTo);
  callbackLink.searchParams.set("token_hash", signInLink.hashedToken);
  callbackLink.searchParams.set("type", signInLink.type);

  const subject = "ASGC OS sign-in link";
  const otpLine = signInLink.otp ? `\nOr use this one-time code:\n${signInLink.otp}\n` : "";
  const text = `Sign in to ASGC OS.\n\nOpen this link to continue:\n${callbackLink.toString()}\n${otpLine}\nIf you did not request this email, you can ignore it.`;

  try {
    await sendEmail({ to: email, subject, text });
  } catch (err) {
    console.error("[auth] sendEmail failed", { message: err instanceof Error ? err.message : "unknown_error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return response;
}

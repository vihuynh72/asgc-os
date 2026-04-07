import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { sendEmail } from "@/lib/emailSender";
import { buildPasswordResetCallbackUrl, buildPasswordResetLink } from "@/lib/auth/password-setup.mjs";
import { buildPasswordResetEmail } from "@/lib/auth/password-reset-email.mjs";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
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

  // Security posture: invite-only. We do NOT reveal allowlist membership.
  // If not allowlisted, we respond with a generic ok.
  const response = NextResponse.json({ ok: true });

  const admin = getSupabaseAdminClient();
  const { data: allowlisted, error: allowlistError } = await admin.rpc("is_email_allowlisted", { _email: email });

  if (allowlistError) {
    console.error("[auth] is_email_allowlisted failed", { message: allowlistError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (!allowlisted) {
    return response;
  }

  const callbackUrl = buildPasswordResetCallbackUrl({
    origin,
    redirectTo: postAuthRedirectTo,
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: callbackUrl },
  });

  if (error || !data?.properties?.hashed_token || !data?.properties?.verification_type) {
    console.error("[auth] generateLink recovery failed", { message: error?.message ?? "missing_link_data" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const resetLink = buildPasswordResetLink({
    origin,
    redirectTo: postAuthRedirectTo,
    tokenHash: data.properties.hashed_token,
    verificationType: data.properties.verification_type,
  });

  const emailMessage = buildPasswordResetEmail({ resetLink });

  try {
    await sendEmail({ to: email, subject: emailMessage.subject, text: emailMessage.text, html: emailMessage.html });
  } catch (err) {
    console.error("[auth] sendEmail failed", { message: err instanceof Error ? err.message : "unknown_error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return response;
}

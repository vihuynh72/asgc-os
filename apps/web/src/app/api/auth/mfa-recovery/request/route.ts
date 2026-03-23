import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { buildMfaRecoveryEmail } from "@/lib/auth/mfa-recovery-email.mjs";
import { sendEmail } from "@/lib/emailSender";
import { getPublicEnv } from "@/lib/env";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const origin = new URL(request.url).origin;

  const env = getPublicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const email = normalizeEmail(user.email);
  const redirectToRaw = safeRedirectPathOrNull(request.nextUrl.searchParams.get("redirectTo"));
  const postResetRedirectTo = safePostAuthRedirectPath(redirectToRaw ?? "/dashboard");

  // Admin recovery should be handled through an admin operator to avoid weakening the highest-value accounts.
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (isAdmin) {
    return NextResponse.json({ ok: false, reason: "admin_recovery_requires_operator" }, { status: 403 });
  }

  // Generate a Supabase recovery link (password recovery) and use it only as an email ownership proof step.
  // The callback handler will set a short-lived recovery cookie and route the user to /mfa/recover.
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("redirectTo", `/mfa/recover?redirectTo=${encodeURIComponent(postResetRedirectTo)}`);

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error || !data?.properties?.hashed_token) {
    console.error("[mfa-recovery] generateLink failed", { message: error?.message ?? "missing_link_data" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const callbackLink = new URL(callbackUrl.toString());
  callbackLink.searchParams.set("token_hash", data.properties.hashed_token);
  callbackLink.searchParams.set("type", "recovery");

  const emailMessage = buildMfaRecoveryEmail({
    recoveryLink: callbackLink.toString(),
    emailOtp: data.properties.email_otp ?? null,
  });

  try {
    await sendEmail({ to: email, subject: emailMessage.subject, text: emailMessage.text, html: emailMessage.html });
  } catch (err) {
    console.error("[mfa-recovery] sendEmail failed", { message: err instanceof Error ? err.message : "unknown_error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { generateSignInLink } from "@/lib/authLinks";
import { sendEmail } from "@/lib/emailSender";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().optional(),
});

async function isAdminForRequest(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const env = getPublicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const email = normalizeEmail(parsed.data.email);
  const safeRedirect = safeRedirectPathOrNull(parsed.data.redirectTo);
  const postAuthRedirectTo = safePostAuthRedirectPath(safeRedirect ?? "/dashboard");

  const callbackUrl = new URL("/auth/callback", origin);
  if (postAuthRedirectTo) callbackUrl.searchParams.set("redirectTo", postAuthRedirectTo);
  const emailRedirectTo = callbackUrl.toString();

  const admin = getSupabaseAdminClient();
  const { data: allowlisted, error: allowlistError } = await admin.rpc("is_email_allowlisted", { _email: email });

  if (allowlistError) {
    console.error("[admin] is_email_allowlisted failed", { message: allowlistError.message });
    return NextResponse.json({ error: allowlistError.message }, { status: 500 });
  }

  if (!allowlisted) {
    return NextResponse.json({ error: "not_allowlisted" }, { status: 403 });
  }

  let signInLink: Awaited<ReturnType<typeof generateSignInLink>>;
  try {
    signInLink = await generateSignInLink(admin, email, emailRedirectTo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generate_link_failed";
    console.error("[admin] generateLink failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
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
    const message = err instanceof Error ? err.message : "send_email_failed";
    console.error("[admin] sendEmail failed", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

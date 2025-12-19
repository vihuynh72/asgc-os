import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
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

  const callbackUrl = new URL("/auth/callback", origin);
  if (postAuthRedirectTo) callbackUrl.searchParams.set("redirectTo", postAuthRedirectTo);

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

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });
  if (error) {
    console.error("[auth] resetPasswordForEmail failed", { message: error.message });
  }

  return response;
}


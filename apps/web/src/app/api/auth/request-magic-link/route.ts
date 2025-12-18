import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { allowlistKeysForNormalizedEmail, normalizeEmail } from "@/lib/invitesAllowlist";
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

  const allowlistKeys = allowlistKeysForNormalizedEmail(email);

  const { data: allowlistedRows, error: allowlistError } = await admin
    .from("invites_allowlist")
    .select("id")
    .in("email_normalized", allowlistKeys)
    .eq("is_active", true)
    .limit(1);

  if (allowlistError) {
    console.error("[auth] allowlist lookup failed", { message: allowlistError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const allowlisted = Array.isArray(allowlistedRows) && allowlistedRows.length > 0;
  if (!allowlisted) {
    return response;
  }

  // Send a PKCE magic link (creates user if absent). Using PKCE ensures Supabase emails include
  // a `code` query param instead of hash fragments so /auth/callback can exchange it server-side.
  const env = getPublicEnv();

  const anon = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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

  const otpRes = await anon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: emailRedirectTo,
      // Allow creation for allowlisted users; invite-only posture enforced above.
      shouldCreateUser: true,
    },
  });

  if (otpRes.error) {
    console.error("[auth] signInWithOtp failed", { message: otpRes.error.message });
  }

  return response;
}

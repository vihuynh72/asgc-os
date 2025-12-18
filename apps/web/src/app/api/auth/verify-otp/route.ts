import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
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
  const response = NextResponse.json({ ok: true, redirectTo });

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

  // Try common email OTP types in a safe order.
  const attempts: Array<"magiclink" | "signup" | "invite"> = ["magiclink", "signup", "invite"];

  let lastErrorMessage: string | null = null;
  for (const type of attempts) {
    const { error } = await supabase.auth.verifyOtp({ email, token, type });
    if (!error) {
      // Best-effort: consume any server-seeded bootstrap grants (helps when the user existed before grants were added).
      try {
        await supabase.rpc("consume_bootstrap_role_grants");
      } catch {
        // Ignore (RPC may not exist yet).
      }

      // Clear any remembered redirect; we’re about to navigate.
      response.cookies.set(POST_AUTH_REDIRECT_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }

    lastErrorMessage = error.message;
  }

  console.error("[auth] verifyOtp (email+token) failed", { message: lastErrorMessage });
  return NextResponse.json({ ok: false }, { status: 401 });
}

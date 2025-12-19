import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { normalizeEmail } from "@/lib/invitesAllowlist";
import { POST_AUTH_REDIRECT_COOKIE, safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

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

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Best-effort: consume any server-seeded bootstrap grants (helps when the user existed before grants were added).
  try {
    await supabase.rpc("consume_bootstrap_role_grants");
  } catch {
    // Ignore (RPC may not exist yet).
  }

  response.cookies.set(POST_AUTH_REDIRECT_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}


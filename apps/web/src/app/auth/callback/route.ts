import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const rawRedirectTo = url.searchParams.get("redirectTo") || "/dashboard";
  // Only allow same-site relative redirects to avoid open redirects.
  const redirectTo = rawRedirectTo.startsWith("/") ? rawRedirectTo : "/dashboard";

  const response = NextResponse.redirect(new URL(redirectTo, url.origin));

  // Supabase emails may include either:
  // - PKCE flow: ?code=...
  // - OTP verify flow: ?token_hash=...&type=magiclink|invite|recovery|email_change
  if (!code && (!tokenHash || !type)) return response;

  const env = getPublicEnv();
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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth] exchangeCodeForSession failed", { message: error.message });
      const errUrl = new URL("/login", url.origin);
      errUrl.searchParams.set("error", "auth_callback_failed");
      errUrl.searchParams.set("redirectTo", redirectTo);
      return NextResponse.redirect(errUrl);
    }

    return response;
  }

  // token_hash + type flow
  const { error } = await supabase.auth.verifyOtp({
    type: type as "magiclink" | "invite" | "recovery" | "email_change",
    token_hash: tokenHash as string,
  });

  if (error) {
    console.error("[auth] verifyOtp failed", { message: error.message, type });
    const errUrl = new URL("/login", url.origin);
    errUrl.searchParams.set("error", "auth_callback_failed");
    errUrl.searchParams.set("redirectTo", redirectTo);
    return NextResponse.redirect(errUrl);
  }

  return response;
}

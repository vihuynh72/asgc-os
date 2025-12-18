import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { allowlistKeysForNormalizedEmail, normalizeEmail } from "@/lib/invitesAllowlist";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash") || url.searchParams.get("token");
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

  // Some providers prepend "pkce_" to the code even though it arrives as `token`.
  // Treat a token that looks like a PKCE code the same as an explicit `code` param.
  const pkceCode = code ?? (tokenHash?.startsWith("pkce_") ? tokenHash : null);

  async function signOutAndRedirect(errorKey: "not_allowlisted" | "server_error") {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore; we'll still redirect.
    }

    const errUrl = new URL("/login", url.origin);
    errUrl.searchParams.set("error", errorKey);
    errUrl.searchParams.set("redirectTo", redirectTo);
    response.headers.set("location", errUrl.toString());
  }

  async function enforceInviteOnlyForSignedInUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const email = user?.email ? normalizeEmail(user.email) : null;
    if (!email) {
      await signOutAndRedirect("server_error");
      return;
    }

    try {
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
        await signOutAndRedirect("server_error");
        return;
      }

      const allowlisted = Array.isArray(allowlistedRows) && allowlistedRows.length > 0;
      if (!allowlisted) {
        await signOutAndRedirect("not_allowlisted");
      }
    } catch (e) {
      console.error("[auth] allowlist lookup crashed", { message: e instanceof Error ? e.message : String(e) });
      await signOutAndRedirect("server_error");
    }
  }

  if (pkceCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(pkceCode);
    if (error) {
      console.error("[auth] exchangeCodeForSession failed", { message: error.message });
      const errUrl = new URL("/login", url.origin);
      errUrl.searchParams.set("error", "auth_callback_failed");
      errUrl.searchParams.set("redirectTo", redirectTo);
      return NextResponse.redirect(errUrl);
    }

    await enforceInviteOnlyForSignedInUser();
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

  await enforceInviteOnlyForSignedInUser();
  return response;
}

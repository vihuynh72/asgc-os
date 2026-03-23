import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { DESIGN_COOKIE_NAME, DESIGN_PARAM_NAME, normalizeDesign } from "@/lib/design-toggle.mjs";
import {
  getOfficeHoursPasswordSetupRedirect,
  isSignedInOfficeHoursKioskPath,
  isOfficeHoursSelfServicePath,
  requiresProtectedAuth,
  requiresStepUpMfa,
} from "@/lib/office-hours-gates.mjs";
import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";
import { getPublicEnv, hasPublicSupabaseEnv } from "@/lib/env";
import { POST_AUTH_REDIRECT_COOKIE } from "@/lib/redirects";

export async function proxy(request: NextRequest) {
  if (!hasPublicSupabaseEnv()) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("env", "missing");
    redirectUrl.searchParams.set("redirectTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  const requestedDesign = normalizeDesign(request.nextUrl.searchParams.get(DESIGN_PARAM_NAME));
  if (requestedDesign) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.searchParams.delete(DESIGN_PARAM_NAME);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(DESIGN_COOKIE_NAME, requestedDesign, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  const pathname = request.nextUrl.pathname;
  const requestedPath = `${pathname}${request.nextUrl.search}`;

  const hasMagicParams =
    request.nextUrl.searchParams.has("code") ||
    request.nextUrl.searchParams.has("token") ||
    request.nextUrl.searchParams.has("token_hash");

  if (hasMagicParams && pathname !== "/auth/callback") {
    const redirectUrl = new URL("/auth/callback", request.url);
    redirectUrl.search = request.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  const isSignedInKioskEntry = isSignedInOfficeHoursKioskPath(pathname);
  const isProtected = requiresProtectedAuth(pathname);

  const hasSupabaseAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!hasSupabaseAuthCookie) {
    if (isSignedInKioskEntry) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("redirectTo", OFFICE_HOURS_MEMBER_KIOSK_PATH);
      return NextResponse.redirect(redirectUrl);
    }

    if (!isProtected) {
      return NextResponse.next({ request });
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", requestedPath);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(POST_AUTH_REDIRECT_COOKIE, requestedPath, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 15,
    });
    return response;
  }

  const env = getPublicEnv();

  const pendingCookies: Array<{ name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] }> =
    [];

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let response = NextResponse.next({ request });

  if (!user) {
    if (isSignedInKioskEntry) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("redirectTo", OFFICE_HOURS_MEMBER_KIOSK_PATH);
      response = NextResponse.redirect(redirectUrl);
    } else if (isProtected) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirectTo", requestedPath);

      response = NextResponse.redirect(redirectUrl);
      response.cookies.set(POST_AUTH_REDIRECT_COOKIE, requestedPath, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 15,
      });
    }
  } else {
    if (isOfficeHoursSelfServicePath(pathname) && pathname !== "/office-hours/setup-password") {
      const { data: profile } = await supabase
        .from("profile_private")
        .select("password_ready_at")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.password_ready_at) {
        response = NextResponse.redirect(new URL(getOfficeHoursPasswordSetupRedirect(requestedPath), request.url));
      }
    }

    if (response.headers.get("location")) {
      // Already redirected.
    } else if (pathname.startsWith("/admin")) {
      const { data: tierData, error: tierErr } = await supabase.rpc("get_admin_tier", { _uid: user.id });

      const tier = tierData?.tier as string | null;

      // Allow access if user has any admin tier (full, partial, or read-only)
      if (tierErr || !tier) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/unauthorized";
        redirectUrl.search = "";
        redirectUrl.searchParams.set("reason", "admin");
        redirectUrl.searchParams.set("redirectTo", requestedPath);
        response = NextResponse.redirect(redirectUrl);
      }
    }
    if (!response.headers.get("location") && requiresStepUpMfa(pathname)) {
      const { data: aalData, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const currentLevel = (aalData?.currentLevel as string | undefined) ?? null;
      if (aalErr || currentLevel !== "aal2") {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/mfa";
        redirectUrl.search = "";
        redirectUrl.searchParams.set("redirectTo", requestedPath);
        response = NextResponse.redirect(redirectUrl);
      }
    }
  }

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

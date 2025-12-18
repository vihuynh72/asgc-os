import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv, hasPublicSupabaseEnv } from "@/lib/env";
import { POST_AUTH_REDIRECT_COOKIE } from "@/lib/redirects";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/account",
  "/office-hours",
  "/tasks",
  "/meetings",
  "/docs",
  "/finance",
  "/admin",
  "/projects",
];

const UNPROTECTED_PREFIXES = ["/office-hours/kiosk"];
const KIOSK_FALLBACK_PREFIXES = ["/office-hours/check-in", "/office-hours/check-out"];

export async function middleware(request: NextRequest) {
  if (!hasPublicSupabaseEnv()) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("env", "missing");
    redirectUrl.searchParams.set("redirectTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
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

  const isExplicitlyPublic = UNPROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isExplicitlyPublic && !hasMagicParams) {
    return NextResponse.next({ request });
  }

  const shouldFallbackToKiosk = KIOSK_FALLBACK_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  const hasSupabaseAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!hasSupabaseAuthCookie) {
    if (shouldFallbackToKiosk) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/office-hours/kiosk";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("redirectTo", requestedPath);
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
    if (shouldFallbackToKiosk) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/office-hours/kiosk";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("redirectTo", requestedPath);
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
  } else if (pathname.startsWith("/admin")) {
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });

    if (adminErr || !isAdmin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/unauthorized";
      redirectUrl.search = "";
      redirectUrl.searchParams.set("reason", "admin");
      redirectUrl.searchParams.set("redirectTo", requestedPath);
      response = NextResponse.redirect(redirectUrl);
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

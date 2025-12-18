import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv, hasPublicSupabaseEnv } from "@/lib/env";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/office-hours",
  "/tasks",
  "/meetings",
  "/docs",
  "/finance",
  "/admin",
  "/projects",
];

export async function middleware(request: NextRequest) {
  if (!hasPublicSupabaseEnv()) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.searchParams.set("env", "missing");
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const pathname = request.nextUrl.pathname;

  const hasMagicParams =
    request.nextUrl.searchParams.has("code") ||
    request.nextUrl.searchParams.has("token") ||
    request.nextUrl.searchParams.has("token_hash");

  if (hasMagicParams && pathname !== "/auth/callback") {
    const redirectUrl = new URL("/auth/callback", request.url);
    redirectUrl.search = request.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Unprotected routes can pass through after token forwarding.
  if (!isProtected) {
    return NextResponse.next({
      request,
    });
  }

  const env = getPublicEnv();

  const response = NextResponse.next({
    request,
  });

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith("/admin")) {
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });

    if (adminErr || !isAdmin) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/office-hours/:path*",
    "/tasks/:path*",
    "/meetings/:path*",
    "/docs/:path*",
    "/finance/:path*",
    "/admin/:path*",
    "/projects/:path*",
  ],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";

export async function middleware(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/admin")) {
    const { data: advisorAssignments } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("user_id", user.id)
      .eq("role_key", "advisor")
      .is("term_id", null)
      .is("ends_at", null)
      .limit(1);

    const isAdvisor = (advisorAssignments?.length ?? 0) > 0;

    let isPresident = false;
    if (!isAdvisor) {
      const { data: currentTerm } = await supabase
        .from("terms")
        .select("id")
        .eq("is_current", true)
        .maybeSingle();

      if (currentTerm?.id) {
        const { data: presidentAssignments } = await supabase
          .from("role_assignments")
          .select("id")
          .eq("user_id", user.id)
          .eq("role_key", "president")
          .eq("term_id", currentTerm.id)
          .is("ends_at", null)
          .limit(1);

        isPresident = (presidentAssignments?.length ?? 0) > 0;
      }
    }

    if (!isAdvisor && !isPresident) {
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
    "/dashboard/:path*",
    "/office-hours/:path*",
    "/tasks/:path*",
    "/meetings/:path*",
    "/docs/:path*",
    "/finance/:path*",
    "/admin/:path*",
  ],
};

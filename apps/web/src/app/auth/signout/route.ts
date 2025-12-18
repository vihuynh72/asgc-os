import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv, hasPublicSupabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

function redirectToLogin(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}

export async function POST(request: NextRequest) {
  if (!hasPublicSupabaseEnv()) return redirectToLogin(request);

  const env = getPublicEnv();
  const response = redirectToLogin(request);

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

  await supabase.auth.signOut();
  return response;
}

export async function GET(request: NextRequest) {
  return POST(request);
}


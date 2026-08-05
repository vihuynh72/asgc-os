import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { getPublicEnv } from "./env";
import { applySupabaseResponseHeaders } from "./supabase-response-headers.mjs";

type ResponseCookieWriter = {
  cookies: {
    set: (name: string, value: string, options?: Record<string, unknown>) => void;
  };
  headers: {
    set: (name: string, value: string) => void;
  };
};

export function getSupabaseRouteHandlerClientWithResponse(request: NextRequest, response: ResponseCookieWriter) {
  const env = getPublicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, responseHeaders: Record<string, string> = {}) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        applySupabaseResponseHeaders(response, responseHeaders);
      },
    },
  });
}

/**
 * For API Route Handlers that only need to read auth state (no session refresh).
 * Uses next/headers cookies() which works in Route Handlers.
 */
export async function getSupabaseRouteHandlerClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, responseHeaders?: Record<string, string>) {
        void cookiesToSet;
        void responseHeaders;
        // No-op: JSON API endpoints don't need to refresh auth cookies.
      },
    },
  });
}

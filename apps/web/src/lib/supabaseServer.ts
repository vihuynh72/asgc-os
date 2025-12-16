import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

import { getPublicEnv } from "./env";

type ResponseCookieWriter = {
  cookies: {
    set: (name: string, value: string, options?: Record<string, unknown>) => void;
  };
};

export function getSupabaseRouteHandlerClient(request: NextRequest, response: ResponseCookieWriter) {
  const env = getPublicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
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
}

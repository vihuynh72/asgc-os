import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "./env";

export function getSupabaseServerComponentClient() {
  const env = getPublicEnv();
  const cookieStorePromise = cookies();

  return cookieStorePromise.then((cookieStore) =>
    createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, responseHeaders?: Record<string, string>) {
          void responseHeaders;
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Next.js Server Components cannot set cookies; proxy should refresh sessions.
          }
        },
      },
    }),
  );
}

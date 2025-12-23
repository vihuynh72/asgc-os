import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";

export type ClubsAuth = {
  userId: string;
  supabase: ReturnType<typeof createServerClient>;
  isAdmin: boolean;
};

async function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op for JSON APIs.
      },
    },
  });
}

export async function requireClubsAuth(
  request: NextRequest,
): Promise<{ ok: true; auth: ClubsAuth } | { ok: false; response: NextResponse }> {
  const supabase = await getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: isAdmin, error } = await supabase.rpc("is_admin", { _uid: user.id });
  if (error) {
    return { ok: false, response: NextResponse.json({ error: "auth_check_failed" }, { status: 500 }) };
  }

  return {
    ok: true,
    auth: {
      userId: user.id,
      supabase,
      isAdmin: !!isAdmin,
    },
  };
}

export async function requireClubsAdmin(
  request: NextRequest,
): Promise<{ ok: true; auth: ClubsAuth } | { ok: false; response: NextResponse }> {
  const result = await requireClubsAuth(request);
  if (!result.ok) return result;

  if (!result.auth.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return result;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";

export const runtime = "nodejs";

function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op: API responses don't need to refresh auth cookies.
      },
    },
  });
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const weekStart = request.nextUrl.searchParams.get("weekStart");
  const weekStartParam = weekStart && weekStart.length > 0 ? weekStart : null;

  const { data, error } = await supabase.rpc("my_office_hour_shifts_week", { _week_start: weekStartParam });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shifts: data ?? [] });
}

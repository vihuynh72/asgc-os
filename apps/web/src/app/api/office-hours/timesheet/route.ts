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

  const [{ data: weekly, error: weeklyErr }, { data: sessions, error: sessionsErr }, { data: exceptions, error: excErr }] =
    await Promise.all([
      supabase.rpc("my_weekly_hours"),
      supabase.rpc("my_timesheet_sessions", { _week_start: weekStartParam }),
      supabase.rpc("my_timesheet_exceptions", { _week_start: weekStartParam }),
    ]);

  if (weeklyErr) return NextResponse.json({ error: weeklyErr.message }, { status: 500 });
  if (sessionsErr) return NextResponse.json({ error: sessionsErr.message }, { status: 500 });
  if (excErr) return NextResponse.json({ error: excErr.message }, { status: 500 });

  const weeklyRow = Array.isArray(weekly) ? weekly[0] : weekly;

  return NextResponse.json({ weekly: weeklyRow ?? null, sessions: sessions ?? [], exceptions: exceptions ?? [] });
}

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

function mapErrorStatus(message: string): number {
  switch (message) {
    case "unauthorized":
      return 401;
    case "no_open_session":
      return 409;
    default:
      return 500;
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("record_office_hours_presence_ping");

  if (error) {
    const msg = error.message || "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ result });
}


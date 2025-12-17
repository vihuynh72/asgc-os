import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type IssuePinRow = {
  pin: string;
  valid_from: string;
  valid_to: string;
  window_seconds: number;
};

async function isAdminForRequest(
  request: NextRequest,
): Promise<
  | { ok: true; userId: string; supabase: ReturnType<typeof createServerClient> }
  | { ok: false; response: NextResponse }
> {
  const env = getPublicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op: these admin endpoints don't need to refresh auth cookies.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, supabase };
}

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const admin = getSupabaseAdminClient();

  const { data: config, error: cfgErr } = await admin
    .from("office_config")
    .select("primary_office_location_id")
    .eq("id", true)
    .maybeSingle();

  if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 });
  if (!config?.primary_office_location_id) {
    return NextResponse.json({ error: "office_config missing" }, { status: 500 });
  }

  const { data: issued, error: issueErr } = await admin
    .rpc("issue_presence_pin", { _office_location_id: config.primary_office_location_id })
    .single();

  if (issueErr) return NextResponse.json({ error: issueErr.message }, { status: 500 });

  await admin.rpc("log_event", {
    action_key: "presence_pin.issued",
    actor_user_id: authz.userId,
    target_type: "office_location",
    target_id: config.primary_office_location_id,
    metadata: {
      valid_from: (issued as IssuePinRow).valid_from,
      valid_to: (issued as IssuePinRow).valid_to,
      window_seconds: (issued as IssuePinRow).window_seconds,
    },
  });

  return NextResponse.json({
    pin: (issued as IssuePinRow).pin,
    validFrom: (issued as IssuePinRow).valid_from,
    validTo: (issued as IssuePinRow).valid_to,
    windowSeconds: (issued as IssuePinRow).window_seconds,
  });
}

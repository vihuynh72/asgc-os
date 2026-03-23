import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { TRUSTED_DEVICE_COOKIE, hashTrustedDeviceToken } from "@/lib/auth/trusted-device.mjs";
import { getServerEnv } from "@/lib/envServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await getSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("trusted_login_devices")
    .select("id,device_label,user_agent,last_seen_at,expires_at,revoked_at,created_at,token_hash")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const serverEnv = getServerEnv();
  const cookieStore = await cookies();
  const trustedToken = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value ?? null;
  const currentTokenHash = trustedToken
    ? hashTrustedDeviceToken({ token: trustedToken, secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY })
    : null;

  return NextResponse.json({
    devices: (data ?? []).map((row) => ({
      id: row.id,
      label: row.device_label ?? row.user_agent ?? "Trusted device",
      userAgent: row.user_agent ?? null,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      isCurrentDevice: currentTokenHash ? row.token_hash === currentTokenHash : false,
    })),
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { TRUSTED_DEVICE_COOKIE, hashTrustedDeviceToken } from "@/lib/auth/trusted-device.mjs";
import { getServerEnv } from "@/lib/envServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const ParamsSchema = z.object({
  deviceId: z.string().uuid(),
});

export async function DELETE(request: NextRequest, context: { params: Promise<{ deviceId: string }> }) {
  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "invalid_device" }, { status: 400 });
  }

  const supabase = await getSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: device, error: deviceError } = await admin
    .from("trusted_login_devices")
    .select("id,token_hash")
    .eq("id", params.data.deviceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (deviceError) {
    return NextResponse.json({ error: deviceError.message }, { status: 500 });
  }

  if (!device?.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await admin
    .from("trusted_login_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", device.id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  const trustedToken = request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value ?? null;
  if (trustedToken) {
    const serverEnv = getServerEnv();
    const currentHash = hashTrustedDeviceToken({
      token: trustedToken,
      secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    });
    if (currentHash === device.token_hash) {
      response.cookies.set(TRUSTED_DEVICE_COOKIE, "", { path: "/", maxAge: 0 });
    }
  }

  return response;
}

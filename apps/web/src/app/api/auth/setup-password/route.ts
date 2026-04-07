import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildPasswordReadyBypassUntil, PASSWORD_READY_BYPASS_METADATA_KEY } from "@/lib/auth/password-ready-state.mjs";
import { issueTrustedDevice } from "@/lib/auth/trusted-device-server.mjs";
import { buildPasswordSetupSuccessPayload } from "@/lib/auth/password-setup.mjs";
import { getServerEnv } from "@/lib/envServer";
import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";
import { safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const BodySchema = z.object({
  password: z.string().min(8),
  redirectTo: z.string().optional(),
  trustDevice: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  let password: string;
  let redirectTo: string;
  let trustDevice = false;

  try {
    const body = BodySchema.parse(await request.json());
    password = body.password;
    const safeRedirect = safeRedirectPathOrNull(body.redirectTo);
    redirectTo = safePostAuthRedirectPath(safeRedirect ?? OFFICE_HOURS_MEMBER_KIOSK_PATH);
    trustDevice = Boolean(body.trustDevice);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await getSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, reason: "missing_session" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const serverEnv = getServerEnv();
  const nowIso = new Date().toISOString();
  const passwordReadyBypassUntil = buildPasswordReadyBypassUntil(nowIso);
  const currentAppMetadata =
    typeof user.app_metadata === "object" && user.app_metadata !== null ? user.app_metadata : {};

  const { error: updatePasswordError } = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: {
      ...currentAppMetadata,
      [PASSWORD_READY_BYPASS_METADATA_KEY]: passwordReadyBypassUntil,
    },
  });
  if (updatePasswordError) {
    console.error("[auth] updateUserById failed", { message: updatePasswordError.message });
    return NextResponse.json({ ok: false, reason: "password_update_failed" }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profile_private").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      password_ready_at: nowIso,
    },
    { onConflict: "id" },
  );

  let warningReason: "profile_sync_failed" | undefined;
  if (profileError) {
    console.error("[auth] profile_private upsert failed", { message: profileError.message, userId: user.id });
    warningReason = "profile_sync_failed";
  }

  await admin.from("audit_log").insert({
    actor_user_id: user.id,
    action_key: "auth.password_setup_completed",
    target_type: "user",
    target_id: user.id,
    metadata: {
      password_ready_at: nowIso,
      password_ready_bypass_until: passwordReadyBypassUntil,
      warning_reason: warningReason ?? null,
    },
  });

  const response = NextResponse.json(buildPasswordSetupSuccessPayload({ redirectTo, warningReason }));

  if (trustDevice) {
    await issueTrustedDevice({
      admin,
      response,
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      secret: serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    });
  }

  return response;
}

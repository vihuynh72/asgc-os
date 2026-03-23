import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";
import { safePostAuthRedirectPath, safeRedirectPathOrNull } from "@/lib/redirects";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const BodySchema = z.object({
  password: z.string().min(8),
  redirectTo: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let password: string;
  let redirectTo: string;

  try {
    const body = BodySchema.parse(await request.json());
    password = body.password;
    const safeRedirect = safeRedirectPathOrNull(body.redirectTo);
    redirectTo = safePostAuthRedirectPath(safeRedirect ?? OFFICE_HOURS_MEMBER_KIOSK_PATH);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = await getSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const { error: updatePasswordError } = await admin.auth.admin.updateUserById(user.id, { password });
  if (updatePasswordError) {
    console.error("[auth] updateUserById failed", { message: updatePasswordError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const { error: profileError } = await admin.from("profile_private").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      password_ready_at: nowIso,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("[auth] profile_private upsert failed", { message: profileError.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    actor_user_id: user.id,
    action_key: "auth.password_setup_completed",
    target_type: "user",
    target_id: user.id,
    metadata: {
      password_ready_at: nowIso,
    },
  });

  return NextResponse.json({ ok: true, redirectTo });
}

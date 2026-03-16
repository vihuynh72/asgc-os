import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFullAdmin } from "@/lib/adminAuth";
import { normalizeKioskPhone } from "@/lib/office-hours-kiosk-auth.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { getKioskMemberRole } from "../../../office-hours/kiosk/_kiosk";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().trim().nullable().optional(),
});

function mapErrorStatus(message: string): number {
  switch (message) {
    case "invalid_phone":
      return 400;
    case "member_not_found":
      return 404;
    default:
      return 500;
  }
}

export async function PUT(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  try {
    const { userId, phone } = parsed.data;
    const member = await getKioskMemberRole(admin, userId);
    if (!member) {
      return NextResponse.json({ error: "member_not_found" }, { status: 404 });
    }

    const nextPhoneRaw = phone?.trim() ?? "";

    if (!nextPhoneRaw) {
      await admin.from("office_hours_kiosk_phone_allowlist").delete().eq("user_id", userId);
      await admin.rpc("log_event", {
        action_key: "office_hours.kiosk_phone_cleared",
        actor_user_id: authz.userId,
        target_type: "profile",
        target_id: userId,
        metadata: {},
      });
      return NextResponse.json({
        phone_configured: false,
        phone_last4: null,
        phone_updated_at: null,
      });
    }

    const normalized = normalizeKioskPhone(nextPhoneRaw);
    if (!normalized) {
      return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("office_hours_kiosk_phone_allowlist")
      .upsert(
        {
          user_id: userId,
          phone_e164: normalized.e164,
          phone_last4: normalized.last4,
          updated_by: authz.userId,
        },
        { onConflict: "user_id" },
      )
      .select("phone_last4,updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await admin.rpc("log_event", {
      action_key: "office_hours.kiosk_phone_updated",
      actor_user_id: authz.userId,
      target_type: "profile",
      target_id: userId,
      metadata: { phone_last4: normalized.last4 },
    });

    return NextResponse.json({
      phone_configured: true,
      phone_last4: data.phone_last4,
      phone_updated_at: data.updated_at,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
  }
}

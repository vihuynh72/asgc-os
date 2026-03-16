import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFullAdmin } from "@/lib/adminAuth";
import { normalizeKioskPhone } from "@/lib/office-hours-kiosk-auth.mjs";
import { normalizeOfficeHoursKioskError } from "@/lib/office-hours-kiosk-setup.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { getKioskMemberRole, getPendingKioskGrant } from "../../../office-hours/kiosk/_kiosk";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    userId: z.string().uuid().nullable().optional(),
    bootstrapRoleGrantId: z.string().uuid().nullable().optional(),
    phone: z.string().trim().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const present = [value.userId, value.bootstrapRoleGrantId].filter((item) => typeof item === "string" && item.length > 0);
    if (present.length !== 1) {
      ctx.addIssue({ code: "custom", message: "invalid_request" });
    }
  });

function mapErrorStatus(message: string): number {
  switch (message) {
    case "invalid_phone":
      return 400;
    case "member_not_found":
      return 404;
    case "grant_not_found":
      return 404;
    case "kiosk_setup_incomplete":
      return 503;
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
    const { userId, bootstrapRoleGrantId, phone } = parsed.data;
    const member = userId ? await getKioskMemberRole(admin, userId) : null;
    const grant = bootstrapRoleGrantId ? await getPendingKioskGrant(admin, bootstrapRoleGrantId) : null;
    if (userId && !member) {
      return NextResponse.json({ error: "member_not_found" }, { status: 404 });
    }
    if (bootstrapRoleGrantId && !grant) {
      return NextResponse.json({ error: "grant_not_found" }, { status: 404 });
    }

    const nextPhoneRaw = phone?.trim() ?? "";

    if (!nextPhoneRaw) {
      const deleteQuery = userId
        ? admin.from("office_hours_kiosk_phone_allowlist").delete().eq("user_id", userId)
        : admin.from("office_hours_kiosk_pending_phone_allowlist").delete().eq("bootstrap_role_grant_id", bootstrapRoleGrantId!);
      const { error: deleteErr } = await deleteQuery;
      if (deleteErr) {
        const message = normalizeOfficeHoursKioskError(deleteErr, "phone_delete_failed");
        return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
      }
      await admin.rpc("log_event", {
        action_key: userId ? "office_hours.kiosk_phone_cleared" : "office_hours.kiosk_pending_phone_cleared",
        actor_user_id: authz.userId,
        target_type: userId ? "profile" : "bootstrap_role_grant",
        target_id: userId ?? bootstrapRoleGrantId!,
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

    const upsertQuery = userId
      ? admin
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
          .single()
      : admin
          .from("office_hours_kiosk_pending_phone_allowlist")
          .upsert(
            {
              bootstrap_role_grant_id: bootstrapRoleGrantId!,
              phone_e164: normalized.e164,
              phone_last4: normalized.last4,
              updated_by: authz.userId,
            },
            { onConflict: "bootstrap_role_grant_id" },
          )
          .select("phone_last4,updated_at")
          .single();

    const { data, error } = await upsertQuery;

    if (error) {
      const message = normalizeOfficeHoursKioskError(error, error.message);
      return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
    }

    await admin.rpc("log_event", {
      action_key: userId ? "office_hours.kiosk_phone_updated" : "office_hours.kiosk_pending_phone_updated",
      actor_user_id: authz.userId,
      target_type: userId ? "profile" : "bootstrap_role_grant",
      target_id: userId ?? bootstrapRoleGrantId!,
      metadata: { phone_last4: normalized.last4 },
    });

    return NextResponse.json({
      phone_configured: true,
      phone_last4: data.phone_last4,
      phone_updated_at: data.updated_at,
    });
  } catch (e) {
    const message = normalizeOfficeHoursKioskError(e, "unknown");
    return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
  }
}

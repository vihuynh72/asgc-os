import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { normalizeOfficeHoursKioskError } from "@/lib/office-hours-kiosk-setup.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import {
  getOpenKioskSession,
  getVerifiedKioskChallenge,
  markKioskChallengeUsed,
} from "../_kiosk";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    verificationToken: z.string().uuid(),
  })
  .strict();

function mapErrorStatus(message: string): number {
  switch (message) {
    case "no_open_session":
      return 409;
    case "verification_invalid":
    case "verification_expired":
    case "verification_used":
      return 403;
    case "kiosk_setup_incomplete":
      return 503;
    default:
      return 500;
  }
}

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { verificationToken } = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
    const challenge = await getVerifiedKioskChallenge(admin, verificationToken, "check_out");
    const openSession = await getOpenKioskSession(admin, challenge.user_id);
    if (!openSession?.id) {
      return NextResponse.json({ error: "no_open_session" }, { status: 409 });
    }

    const checkoutAt = new Date().toISOString();

    const { data: updated, error: updateErr } = await admin
      .from("office_hour_sessions")
      .update({
        checkout_at: checkoutAt,
        status: "closed",
        distance_m_at_checkout: null,
        needs_review: false,
        review_reason: null,
        next_checkout_reminder_at: null,
      })
      .eq("id", openSession.id)
      .eq("status", "open")
      .is("checkout_at", null)
      .select("id,checkin_at,checkout_at,office_location_id,distance_m_at_checkout")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (!updated?.id) {
      return NextResponse.json({ error: "no_open_session" }, { status: 409 });
    }

    await markKioskChallengeUsed(admin, challenge.id);

    const durationMinutes = Math.max(
      0,
      Math.round((new Date(updated.checkout_at).getTime() - new Date(updated.checkin_at).getTime()) / 60_000),
    );

    await admin.from("audit_log").insert({
      actor_user_id: challenge.user_id,
      action_key: "office_hours.check_out",
      target_type: "office_hour_session",
      target_id: updated.id,
      metadata: {
        method: "kiosk_sms_otp",
        office_location_id: updated.office_location_id,
        distance_m_at_checkout: null,
        duration_minutes: durationMinutes,
        needs_review: false,
      },
    });

    return NextResponse.json({ session: { ...updated, duration_minutes: durationMinutes } });
  } catch (e) {
    const msg = normalizeOfficeHoursKioskError(e, "unknown");
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }
}

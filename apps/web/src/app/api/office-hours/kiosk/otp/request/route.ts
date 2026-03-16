import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSmsEnv } from "@/lib/envServer";
import { buildKioskOtpSmsText } from "@/lib/office-hours-kiosk-messages.mjs";
import { sendSms } from "@/lib/smsSender.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import {
  createOrRefreshKioskOtpChallenge,
  getKioskSmsConfig,
  getMatchedKioskPhone,
  getOpenKioskSession,
} from "../../_kiosk";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().min(7),
});

function mapErrorStatus(message: string): number {
  switch (message) {
    case "invalid_phone":
      return 400;
    case "member_not_found":
      return 404;
    case "phone_not_allowed":
    case "sms_disabled":
    case "otp_rate_limited":
    case "otp_resend_too_soon":
      return 403;
    default:
      return 500;
  }
}

function requestIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const [first] = forwarded.split(",");
  return first?.trim() || null;
}

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  try {
    const { userId, phone } = parsed.data;
    const matchedPhone = await getMatchedKioskPhone(admin, userId, phone);
    const openSession = await getOpenKioskSession(admin, userId);
    const intent = openSession?.id ? "check_out" : "check_in";
    const config = await getKioskSmsConfig(admin);
    if (!config.kioskSmsEnabled) {
      return NextResponse.json({ error: "sms_disabled" }, { status: 403 });
    }

    const smsEnv = getSmsEnv();
    const challenge = await createOrRefreshKioskOtpChallenge(admin, {
      userId,
      phoneE164: matchedPhone.phoneE164,
      intent,
      ttlMinutes: config.otpTtlMinutes,
      otpSecret: smsEnv.OFFICE_HOURS_KIOSK_OTP_SECRET,
      requestIp: requestIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    const text = buildKioskOtpSmsText({
      code: challenge.code,
      expiresInMinutes: config.otpTtlMinutes,
    });

    const { data: queuedRow } = await admin
      .from("notification_log")
      .insert({
        actor_user_id: null,
        user_id: userId,
        type: `office_hours.kiosk_otp_${intent}`,
        channel: "sms",
        provider: "twilio",
        to_phone: matchedPhone.phoneE164,
        subject: null,
        status: "queued",
        metadata: {
          challenge_id: challenge.challengeId,
          intent,
        },
      })
      .select("id")
      .maybeSingle();

    try {
      const result = await sendSms({
        to: matchedPhone.phoneE164,
        body: text,
        env: smsEnv,
      });

      if (queuedRow?.id) {
        await admin
          .from("notification_log")
          .update({ status: "sent", provider_message_id: result.providerMessageId, error_message: null })
          .eq("id", queuedRow.id);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "sms_send_failed";
      if (queuedRow?.id) {
        await admin.from("notification_log").update({ status: "failed", error_message: message }).eq("id", queuedRow.id);
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({
      challengeId: challenge.challengeId,
      intent,
      expiresAt: challenge.expiresAtIso,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
  }
}

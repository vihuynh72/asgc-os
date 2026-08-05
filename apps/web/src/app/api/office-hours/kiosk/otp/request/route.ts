import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getKioskOtpSecret, getSmsEnv } from "@/lib/envServer";
import { normalizeKioskRequestIp } from "@/lib/office-hours-kiosk-auth.mjs";
import { normalizeOfficeHoursKioskError } from "@/lib/office-hours-kiosk-setup.mjs";
import { buildKioskOtpSmsText } from "@/lib/office-hours-kiosk-messages.mjs";
import { sendSms } from "@/lib/smsSender.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import {
  createOrRefreshKioskOtpChallenge,
  consumeKioskOtpRateLimit,
  getKioskSmsConfig,
  getMatchedKioskPhone,
  getOpenKioskSession,
} from "../../_kiosk";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().min(7).max(64),
});

function mapErrorStatus(message: string): number {
  switch (message) {
    case "invalid_phone":
      return 400;
    case "invalid_member_or_phone":
      return 400;
    case "sms_disabled":
      return 403;
    case "otp_rate_limited":
    case "otp_resend_too_soon":
      return 429;
    case "kiosk_setup_incomplete":
      return 503;
    default:
      return 500;
  }
}

function requestIp(request: NextRequest): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  const forwarded = request.headers.get("x-forwarded-for");
  const [vercelFirst] = vercelForwarded?.split(",") ?? [];
  const [first] = forwarded?.split(",") ?? [];
  return (
    normalizeKioskRequestIp(vercelFirst) ??
    normalizeKioskRequestIp(first) ??
    normalizeKioskRequestIp(request.headers.get("x-real-ip")) ??
    "unknown"
  );
}

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdminClient();

  try {
    const otpSecret = getKioskOtpSecret();
    await consumeKioskOtpRateLimit(admin, {
      scope: "ip",
      subject: requestIp(request),
      secret: otpSecret,
    });

    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { userId, phone } = parsed.data;
    const matchedPhone = await getMatchedKioskPhone(admin, userId, phone);
    const openSession = await getOpenKioskSession(admin, userId);
    const intent = openSession?.id ? "check_out" : "check_in";
    const config = await getKioskSmsConfig(admin);
    if (!config.schemaReady) {
      return NextResponse.json({ error: "kiosk_setup_incomplete" }, { status: 503 });
    }
    if (!config.kioskSmsEnabled) {
      return NextResponse.json({ error: "sms_disabled" }, { status: 403 });
    }

    const smsEnv = getSmsEnv();
    await consumeKioskOtpRateLimit(admin, {
      scope: "member",
      subject: userId,
      secret: otpSecret,
    });
    await consumeKioskOtpRateLimit(admin, {
      scope: "phone",
      subject: matchedPhone.phoneE164,
      secret: otpSecret,
    });

    const challenge = await createOrRefreshKioskOtpChallenge(admin, {
      userId,
      phoneE164: matchedPhone.phoneE164,
      intent,
      ttlMinutes: config.otpTtlMinutes,
      otpSecret: smsEnv.OFFICE_HOURS_KIOSK_OTP_SECRET,
      userAgent: request.headers.get("user-agent"),
    });

    const text = buildKioskOtpSmsText({
      code: challenge.code,
      expiresInMinutes: config.otpTtlMinutes,
    });

    const { data: queuedRow, error: queueErr } = await admin
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

    if (queueErr) {
      const message = normalizeOfficeHoursKioskError(queueErr, "notification_queue_failed");
      return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
    }

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
    const normalized = normalizeOfficeHoursKioskError(e, "unknown");
    const message = ["member_not_found", "phone_not_allowed"].includes(normalized)
      ? "invalid_member_or_phone"
      : normalized;
    return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
  }
}

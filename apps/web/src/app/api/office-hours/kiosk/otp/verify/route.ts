import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSmsEnv } from "@/lib/envServer";
import { normalizeOfficeHoursKioskError } from "@/lib/office-hours-kiosk-setup.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { getMatchedKioskPhone, verifyKioskOtpChallengeCode, type KioskIntent } from "../../_kiosk";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().min(7),
  challengeId: z.string().uuid(),
  intent: z.enum(["check_in", "check_out"]),
  code: z.string().regex(/^\d{6}$/),
});

function mapErrorStatus(message: string): number {
  switch (message) {
    case "invalid_request":
    case "invalid_phone":
    case "invalid_otp":
    case "otp_expired":
    case "otp_attempt_limit":
      return 400;
    case "member_not_found":
      return 404;
    case "phone_not_allowed":
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
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  try {
    const { userId, phone, challengeId, intent, code } = parsed.data as {
      userId: string;
      phone: string;
      challengeId: string;
      intent: KioskIntent;
      code: string;
    };
    const matchedPhone = await getMatchedKioskPhone(admin, userId, phone);
    const smsEnv = getSmsEnv();
    const verified = await verifyKioskOtpChallengeCode(admin, {
      challengeId,
      userId,
      phoneE164: matchedPhone.phoneE164,
      intent,
      code,
      otpSecret: smsEnv.OFFICE_HOURS_KIOSK_OTP_SECRET,
    });

    return NextResponse.json({
      verificationToken: verified.verificationToken,
      verificationExpiresAt: verified.verificationExpiresAtIso,
      intent,
    });
  } catch (e) {
    const message = normalizeOfficeHoursKioskError(e, "unknown");
    return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
  }
}

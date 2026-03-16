import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { getMatchedKioskPhone, getOpenKioskSession } from "../_kiosk";

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
      return 403;
    default:
      return 500;
  }
}

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { userId, phone } = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
    const matchedPhone = await getMatchedKioskPhone(admin, userId, phone);
    const openSession = await getOpenKioskSession(admin, userId);

    return NextResponse.json({
      intent: openSession?.id ? "check_out" : "check_in",
      phone_last4: matchedPhone.phoneLast4,
      open_session: openSession ? { id: openSession.id, checkin_at: openSession.checkin_at } : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }
}

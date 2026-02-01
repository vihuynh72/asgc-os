import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { getAllowlistDecision, getUserIdByEmail, normalizeKioskEmail } from "../_kiosk";

export const runtime = "nodejs";

const EmailSchema = z.string().email().transform(normalizeKioskEmail);

export async function GET(request: NextRequest) {
  const emailRaw = request.nextUrl.searchParams.get("email") ?? "";
  const parsed = EmailSchema.safeParse(emailRaw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const email = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
    const decision = await getAllowlistDecision(admin, email);
    if (!decision.allowed) {
      const status = decision.reason === "email_blocked" ? 403 : 403;
      return NextResponse.json({ error: decision.reason }, { status });
    }

    const userId = await getUserIdByEmail(admin, email);
    if (!userId) {
      return NextResponse.json({ user_exists: false, open_session: null });
    }

    const { data: openSession, error } = await admin
      .from("office_hour_sessions")
      .select("id,checkin_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .is("checkout_at", null)
      .order("checkin_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ user_exists: true, open_session: openSession ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

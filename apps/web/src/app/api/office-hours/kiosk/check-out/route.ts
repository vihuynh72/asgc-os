import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import {
  appendReviewReason,
  getOfficeGeo,
  getOrCreateUserIdByEmail,
  haversineMeters,
  isEmailAllowlisted,
  normalizeKioskEmail,
} from "../_kiosk";

export const runtime = "nodejs";

const BodySchema = z
  .object({
    email: z.string().email().transform(normalizeKioskEmail),
    lat: z
      .number()
      .finite()
      .refine((v) => v >= -90 && v <= 90, { message: "invalid_lat" })
      .optional(),
    lon: z
      .number()
      .finite()
      .refine((v) => v >= -180 && v <= 180, { message: "invalid_lon" })
      .optional(),
  })
  .refine((v) => (v.lat === undefined) === (v.lon === undefined), { message: "location_incomplete" });

function mapErrorStatus(message: string): number {
  switch (message) {
    case "email_not_allowed":
      return 403;
    case "no_open_session":
      return 409;
    case "office_location_not_configured":
    case "office_location_missing":
    case "office_config_missing":
    case "invalid_lat":
    case "invalid_lon":
    case "location_incomplete":
      return 400;
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

  const { email, lat, lon } = parsed.data;
  const admin = getSupabaseAdminClient();

  try {
    const allowlisted = await isEmailAllowlisted(admin, email);
    if (!allowlisted) {
      return NextResponse.json({ error: "email_not_allowed" }, { status: 403 });
    }

    const userId = await getOrCreateUserIdByEmail(admin, email);

    const { data: openSession, error: readErr } = await admin
      .from("office_hour_sessions")
      .select("id,checkin_at,needs_review,review_reason,office_location_id")
      .eq("user_id", userId)
      .eq("status", "open")
      .is("checkout_at", null)
      .order("checkin_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    if (!openSession?.id) {
      return NextResponse.json({ error: "no_open_session" }, { status: 409 });
    }

    const checkoutAt = new Date().toISOString();
    let dist: number | null = null;
    let reason: string | null = null;
    let shouldReview = false;
    let resolvedOfficeId: string | null = (openSession.office_location_id as string | null) ?? null;

    if (typeof lat === "number" && typeof lon === "number") {
      const geo = await getOfficeGeo(admin, resolvedOfficeId);
      resolvedOfficeId = geo.officeLocationId;
      dist = haversineMeters(lat, lon, geo.lat, geo.lon);

      if (dist > geo.graceRadiusM) {
        reason = "checkout_outside_grace";
        shouldReview = true;
      } else if (dist > geo.radiusM) {
        reason = "checkout_within_grace";
        shouldReview = true;
      }
    } else {
      reason = "checkout_no_location";
      shouldReview = true;
    }

    const newNeedsReview = (openSession.needs_review ?? false) || shouldReview;
    const newReviewReason = appendReviewReason(openSession.review_reason as string | null, reason);

    const { data: updated, error: updateErr } = await admin
      .from("office_hour_sessions")
      .update({
        checkout_at: checkoutAt,
        status: "closed",
        distance_m_at_checkout: dist,
        needs_review: newNeedsReview,
        review_reason: newReviewReason,
      })
      .eq("id", openSession.id)
      .eq("status", "open")
      .is("checkout_at", null)
      .select("id,checkin_at,checkout_at,office_location_id,needs_review,review_reason,distance_m_at_checkout")
      .maybeSingle();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (!updated?.id) {
      return NextResponse.json({ error: "no_open_session" }, { status: 409 });
    }

    const durationMinutes = Math.max(
      0,
      Math.round((new Date(updated.checkout_at).getTime() - new Date(updated.checkin_at).getTime()) / 60_000),
    );

    await admin.from("audit_log").insert({
      actor_user_id: userId,
      action_key: "office_hours.check_out",
      target_type: "office_hour_session",
      target_id: updated.id,
      metadata: {
        method: "kiosk_email",
        email,
        office_location_id: resolvedOfficeId ?? updated.office_location_id,
        distance_m_at_checkout: dist,
        duration_minutes: durationMinutes,
        needs_review: updated.needs_review,
        review_reason: updated.review_reason,
      },
    });

    return NextResponse.json({ session: { ...updated, duration_minutes: durationMinutes } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: mapErrorStatus(msg) });
  }
}


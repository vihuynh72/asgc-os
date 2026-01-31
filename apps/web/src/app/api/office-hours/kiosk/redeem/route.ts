import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op: API responses don't need to refresh auth cookies.
      },
    },
  });
}

const BodySchema = z.object({
  token: z.string().min(16),
});

type KioskTokenRow = {
  token: string;
  action: "check_in" | "check_out";
  office_location_id: string | null;
  distance_m: number | null;
  within_radius: boolean | null;
  within_grace: boolean | null;
  expires_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
};

function isExpired(expiresAtIso: string): boolean {
  const ms = Date.parse(expiresAtIso);
  return !Number.isFinite(ms) || ms <= Date.now();
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const token = parsed.data.token;

  const { data: tokenRowRaw, error: tokenErr } = await admin
    .from("office_hour_kiosk_tokens")
    .select("token,action,office_location_id,distance_m,within_radius,within_grace,expires_at,used_at,used_by_user_id")
    .eq("token", token)
    .limit(1)
    .maybeSingle();

  if (tokenErr) return NextResponse.json({ error: tokenErr.message }, { status: 500 });

  const tokenRow = (tokenRowRaw as KioskTokenRow | null) ?? null;
  if (!tokenRow) return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  if (tokenRow.used_at || tokenRow.used_by_user_id) return NextResponse.json({ error: "token_used" }, { status: 400 });
  if (isExpired(tokenRow.expires_at)) return NextResponse.json({ error: "token_expired" }, { status: 400 });

  const nowIso = new Date().toISOString();

  if (tokenRow.action === "check_in") {
    const { data: existing } = await admin
      .from("office_hour_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "open")
      .is("checkout_at", null)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ error: "already_checked_in" }, { status: 409 });
    }

    const { data: session, error: insertErr } = await admin
      .from("office_hour_sessions")
      .insert({
        user_id: user.id,
        office_location_id: tokenRow.office_location_id,
        checkin_at: nowIso,
        status: "open",
        within_radius: tokenRow.within_radius ?? false,
        within_grace: tokenRow.within_grace ?? false,
        distance_m_at_checkin: tokenRow.distance_m,
        needs_review: false,
        review_reason: null,
        requires_presence: false,
        last_presence_at: nowIso,
      })
      .select("id,checkin_at,office_location_id,within_radius,within_grace")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message || "check_in_failed" }, { status: 500 });
    }

    await admin.from("office_hour_kiosk_tokens").update({ used_at: nowIso, used_by_user_id: user.id }).eq("token", token);

    await admin.from("audit_log").insert({
      actor_user_id: user.id,
      action_key: "office_hours.check_in",
      target_type: "office_hour_session",
      target_id: session.id,
      metadata: {
        method: "kiosk_qr",
        office_location_id: tokenRow.office_location_id,
        distance_m: tokenRow.distance_m,
        within_radius: tokenRow.within_radius,
        within_grace: tokenRow.within_grace,
        token_expires_at: tokenRow.expires_at,
      },
    });

    return NextResponse.json({ ok: true, action: "check_in", session }, { status: 200 });
  }

  // check_out
  const { data: openSession, error: openErr } = await admin
    .from("office_hour_sessions")
    .select("id,checkin_at")
    .eq("user_id", user.id)
    .eq("status", "open")
    .is("checkout_at", null)
    .order("checkin_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 });
  if (!openSession?.id) return NextResponse.json({ error: "no_open_session" }, { status: 409 });

  const { error: closeErr } = await admin
    .from("office_hour_sessions")
    .update({
      checkout_at: nowIso,
      status: "closed",
      needs_review: false,
      review_reason: null,
    })
    .eq("id", openSession.id);

  if (closeErr) return NextResponse.json({ error: closeErr.message }, { status: 500 });

  await admin.from("office_hour_kiosk_tokens").update({ used_at: nowIso, used_by_user_id: user.id }).eq("token", token);

  await admin.from("audit_log").insert({
    actor_user_id: user.id,
    action_key: "office_hours.check_out",
    target_type: "office_hour_session",
    target_id: openSession.id,
    metadata: {
      method: "kiosk_qr",
      token_expires_at: tokenRow.expires_at,
    },
  });

  return NextResponse.json({ ok: true, action: "check_out", session_id: openSession.id }, { status: 200 });
}


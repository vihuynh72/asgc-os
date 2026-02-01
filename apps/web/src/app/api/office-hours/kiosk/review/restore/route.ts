import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  sessionId: z.string().uuid(),
});

type SessionRow = {
  id: string;
  user_id: string;
  checkin_at: string;
  kiosk_checkin_photo_bucket: string | null;
  kiosk_checkin_photo_path: string | null;
  kiosk_checkin_photo_deleted_at: string | null;
  kiosk_checkin_photo_quarantine_bucket: string | null;
  kiosk_checkin_photo_quarantine_path: string | null;
  kiosk_checkin_photo_quarantined_at: string | null;
  kiosk_checkin_photo_restored_at: string | null;
};

async function isAllowlistedUserId(admin: ReturnType<typeof getSupabaseAdminClient>, userId: string): Promise<boolean> {
  const { data: allowlistedIdsRaw, error } = await admin.rpc("allowlisted_user_ids", { _user_ids: [userId] });
  if (error) throw new Error(error.message);
  const allowlistedIds = new Set(
    ((allowlistedIdsRaw ?? []) as unknown[])
      .map((r: unknown) =>
        typeof r === "string" ? r : (r as { allowlisted_user_ids?: unknown } | null)?.allowlisted_user_ids,
      )
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
  );
  return allowlistedIds.has(userId);
}

export async function POST(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const admin = getSupabaseAdminClient();

  const { data: row, error } = await admin
    .from("office_hour_sessions")
    .select(
      "id,user_id,checkin_at,kiosk_checkin_photo_bucket,kiosk_checkin_photo_path,kiosk_checkin_photo_deleted_at,kiosk_checkin_photo_quarantine_bucket,kiosk_checkin_photo_quarantine_path,kiosk_checkin_photo_quarantined_at,kiosk_checkin_photo_restored_at",
    )
    .eq("id", parsed.data.sessionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row?.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = row as SessionRow;

  if (!(await isAllowlistedUserId(admin, session.user_id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!session.kiosk_checkin_photo_deleted_at || !session.kiosk_checkin_photo_quarantine_path || !session.kiosk_checkin_photo_quarantine_bucket) {
    return NextResponse.json({ error: "not_quarantined" }, { status: 409 });
  }

  if (!session.kiosk_checkin_photo_bucket || !session.kiosk_checkin_photo_path) {
    return NextResponse.json({ error: "no_original_path" }, { status: 500 });
  }

  if (session.kiosk_checkin_photo_restored_at) {
    return NextResponse.json({ error: "already_restored" }, { status: 409 });
  }

  const qAt = session.kiosk_checkin_photo_quarantined_at ? Date.parse(session.kiosk_checkin_photo_quarantined_at) : NaN;
  if (Number.isFinite(qAt)) {
    const ageMs = Date.now() - qAt;
    const maxAgeMs = 1000 * 60 * 60 * 24 * 30;
    if (ageMs > maxAgeMs) {
      return NextResponse.json({ error: "restore_window_expired" }, { status: 400 });
    }
  }

  const { error: moveErr } = await admin.storage
    .from(session.kiosk_checkin_photo_quarantine_bucket)
    .move(session.kiosk_checkin_photo_quarantine_path, session.kiosk_checkin_photo_path);

  if (moveErr) return NextResponse.json({ error: moveErr.message || "photo_move_failed" }, { status: 500 });

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await admin
    .from("office_hour_sessions")
    .update({
      kiosk_checkin_photo_deleted_at: null,
      kiosk_checkin_photo_restored_at: nowIso,
      kiosk_checkin_photo_restored_by: authz.userId,
    })
    .eq("id", session.id);

  if (updateErr) {
    // Best-effort rollback: attempt to move back into quarantine.
    await admin.storage.from(session.kiosk_checkin_photo_bucket).move(session.kiosk_checkin_photo_path, session.kiosk_checkin_photo_quarantine_path).catch(() => null);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  try {
    await admin.from("audit_log").insert({
      actor_user_id: authz.userId,
      action_key: "office_hours.kiosk_photo_restored",
      target_type: "office_hour_session",
      target_id: session.id,
      metadata: {
        session_id: session.id,
        user_id: session.user_id,
        from: session.kiosk_checkin_photo_quarantine_path,
        to: session.kiosk_checkin_photo_path,
      },
    });
  } catch {
    // Ignore audit failures
  }

  return NextResponse.json({ ok: true });
}

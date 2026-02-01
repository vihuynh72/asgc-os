import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const QuerySchema = z.object({
  sessionId: z.string().uuid(),
});

type OfficeHourSessionPhotoRow = {
  id: string;
  user_id: string;
  kiosk_checkin_photo_bucket: string | null;
  kiosk_checkin_photo_path: string | null;
  kiosk_checkin_photo_deleted_at: string | null;
};

export async function GET(request: NextRequest) {
  const supabase = await getSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: canView, error: canViewErr } = await supabase.rpc("can_view_office_hours_photos");
  if (canViewErr || !canView) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = QuerySchema.safeParse({
    sessionId: request.nextUrl.searchParams.get("sessionId"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: row, error } = await admin
    .from("office_hour_sessions")
    .select("id,user_id,kiosk_checkin_photo_bucket,kiosk_checkin_photo_path,kiosk_checkin_photo_deleted_at")
    .eq("id", parsed.data.sessionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row?.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = row as OfficeHourSessionPhotoRow;

  if (session.kiosk_checkin_photo_deleted_at) {
    return NextResponse.json({ error: "photo_deleted" }, { status: 404 });
  }

  if (!session.kiosk_checkin_photo_bucket || !session.kiosk_checkin_photo_path) {
    return NextResponse.json({ error: "no_photo" }, { status: 404 });
  }

  const { data: allowlistedIdsRaw, error: allowlistErr } = await admin.rpc("allowlisted_user_ids", {
    _user_ids: [session.user_id],
  });
  if (allowlistErr) return NextResponse.json({ error: allowlistErr.message }, { status: 500 });

  const allowlistedIds = new Set(
    ((allowlistedIdsRaw ?? []) as unknown[])
      .map((r: unknown) =>
        typeof r === "string" ? r : (r as { allowlisted_user_ids?: unknown } | null)?.allowlisted_user_ids,
      )
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0),
  );

  if (!allowlistedIds.has(session.user_id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const expiresInSeconds = 60 * 5;
  const { data: signed, error: signedErr } = await admin.storage
    .from(session.kiosk_checkin_photo_bucket)
    .createSignedUrl(session.kiosk_checkin_photo_path, expiresInSeconds);

  if (signedErr) return NextResponse.json({ error: signedErr.message }, { status: 500 });
  if (!signed?.signedUrl) return NextResponse.json({ error: "signed_url_failed" }, { status: 500 });

  return NextResponse.json({ url: signed.signedUrl, expiresInSeconds });
}


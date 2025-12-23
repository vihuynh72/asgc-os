import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireClubsAdmin } from "../../clubs-auth";

export const runtime = "nodejs";

const RefreshSchema = z.object({
  clubId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  const authResult = await requireClubsAdmin(request);
  if (!authResult.ok) return authResult.response;

  const parsed = RefreshSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const clubId = parsed.data.clubId ?? null;

  const { error } = await admin.rpc("refresh_club_eligibility", {
    _club_id: clubId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

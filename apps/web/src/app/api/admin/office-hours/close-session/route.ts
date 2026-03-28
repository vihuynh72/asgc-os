import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { closeOfficeHoursAdminSession } from "@/lib/office-hours-admin-close";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  checkoutAt: z.string().min(1),
  excludeFromTotals: z.boolean().optional().default(false),
  reason: z.string().trim().min(2),
});

export async function POST(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { sessionId, checkoutAt, excludeFromTotals, reason } = parsed.data;

  const supabase = await getSupabaseRouteHandlerClient();
  const admin = getSupabaseAdminClient();
  const result = await closeOfficeHoursAdminSession({
    routeSupabase: supabase,
    admin,
    actorUserId: authz.userId,
    sessionId,
    checkoutAt,
    excludeFromTotals,
    reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    session: result.session,
    notify_error: result.notify_error,
  });
}

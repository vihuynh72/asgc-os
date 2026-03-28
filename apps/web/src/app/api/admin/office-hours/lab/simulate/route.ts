import { NextResponse, type NextRequest } from "next/server";

import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { loadOfficeHoursLabContext } from "@/lib/office-hours-lab-data";
import { OfficeHoursLabRequestSchema } from "@/lib/office-hours-lab-schema";
import { simulateOfficeHoursLab } from "@/lib/office-hours-lab";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const parsed = OfficeHoursLabRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const context = await loadOfficeHoursLabContext(admin);
  const result = simulateOfficeHoursLab({
    context,
    request: parsed.data,
  });

  return NextResponse.json({ ok: true, result });
}

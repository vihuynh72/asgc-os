import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const UpdateShiftSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  officeLocationId: z.string().uuid().optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const { shiftId } = await params;
  const parsed = UpdateShiftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await getSupabaseRouteHandlerClient();
  const { data, error } = await supabase.rpc("admin_update_office_hour_shift", {
    _shift_id: shiftId,
    _starts_at: parsed.data.startsAt,
    _ends_at: parsed.data.endsAt,
    _office_location_id: parsed.data.officeLocationId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shift: data });
}

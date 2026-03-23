import { NextResponse, type NextRequest } from "next/server";

import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ shiftId: string }> },
) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const { shiftId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();
  const { data, error } = await supabase.rpc("admin_cancel_office_hour_shift", {
    _shift_id: shiftId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shift: data });
}

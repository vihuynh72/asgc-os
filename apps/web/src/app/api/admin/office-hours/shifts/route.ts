import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requirePartialAdmin } from "@/lib/adminAuth";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const CreateShiftSchema = z.object({
  userId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  officeLocationId: z.string().uuid().optional(),
});

// POST: Create a shift (partial admin or higher with write access)
export async function POST(request: NextRequest) {
  const authz = await requirePartialAdmin(request);
  if (!authz.ok) return authz.response;

  const supabase = await getSupabaseRouteHandlerClient();

  const parsed = CreateShiftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { userId, startsAt, endsAt, officeLocationId } = parsed.data;

  const { data, error } = await supabase.rpc("admin_create_office_hour_shift", {
    _user_id: userId,
    _starts_at: startsAt,
    _ends_at: endsAt,
    _office_location_id: officeLocationId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shift: data });
}

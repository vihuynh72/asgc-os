import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireClubsAuth, requireClubsAdmin } from "../clubs-auth";

export const runtime = "nodejs";

const ChecklistUpdateSchema = z.object({
  clubId: z.string().uuid(),
  itemKey: z.string().min(1),
  status: z.enum(["pending", "submitted", "complete", "waived"]),
  notes: z.string().trim().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireClubsAuth(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;

  const [itemsRes, checklistRes] = await Promise.all([
    supabase
      .from("club_charter_checklist_items")
      .select("item_key,label,description,is_required,sort_order,source_reference")
      .order("sort_order", { ascending: true }),
    supabase
      .from("club_charter_checklist")
      .select("club_id,item_key,status,checked_at,checked_by,notes")
      .order("created_at", { ascending: true }),
  ]);

  if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 500 });
  if (checklistRes.error) return NextResponse.json({ error: checklistRes.error.message }, { status: 500 });

  return NextResponse.json({
    checklistItems: itemsRes.data ?? [],
    checklist: checklistRes.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireClubsAdmin(request);
  if (!authResult.ok) return authResult.response;

  const parsed = ChecklistUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const payload = parsed.data;

  const { data, error } = await admin
    .from("club_charter_checklist")
    .upsert(
      {
        club_id: payload.clubId,
        item_key: payload.itemKey,
        status: payload.status,
        notes: payload.notes ?? null,
        checked_at: payload.status === "complete" ? new Date().toISOString() : null,
        checked_by: authResult.auth.userId,
      },
      { onConflict: "club_id,item_key" },
    )
    .select("club_id,item_key,status,checked_at,checked_by,notes")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "clubs.checklist.updated",
    actor_user_id: authResult.auth.userId,
    target_type: "club",
    target_id: payload.clubId,
    metadata: { item_key: payload.itemKey, status: payload.status },
  });

  return NextResponse.json({ checklist: data });
}

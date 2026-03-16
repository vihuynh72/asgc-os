import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { listKioskMembers } from "../_kiosk";

export const runtime = "nodejs";

export async function GET() {
  const admin = getSupabaseAdminClient();

  try {
    const members = await listKioskMembers(admin);
    return NextResponse.json({
      members: members.map((member) => ({
        user_id: member.user_id,
        display_name: member.display_name,
        role_key: member.role_key,
        role_label: member.role_label,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "kiosk_members_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

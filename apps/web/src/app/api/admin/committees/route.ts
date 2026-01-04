import { NextResponse, type NextRequest } from "next/server";

import { requireAnyAdminRead, requireFullAdmin } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authz = await requireAnyAdminRead(request);
  if (!authz.ok) return authz.response;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("committees")
    .select("id,name,committee_key")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ committees: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const body = (await request.json().catch(() => null)) as { name?: string; committee_key?: string } | null;
  const name = body?.name?.trim() ?? "";
  const committeeKey = body?.committee_key?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ error: "Committee name is required." }, { status: 400 });
  }
  if (!committeeKey) {
    return NextResponse.json({ error: "Committee key is required." }, { status: 400 });
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(committeeKey)) {
    return NextResponse.json(
      { error: "Committee key must use letters, numbers, underscores, or hyphens." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("committees")
    .insert({ name, committee_key: committeeKey })
    .select("id,name,committee_key")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Committee key already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ committee: data });
}

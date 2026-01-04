import { NextResponse, type NextRequest } from "next/server";

import { requireFullAdmin } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type Params = { params: Promise<{ committeeId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const { committeeId } = await params;
  if (!committeeId) {
    return NextResponse.json({ error: "Committee id is required." }, { status: 400 });
  }

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
    .update({ name, committee_key: committeeKey })
    .eq("id", committeeId)
    .select("id,name,committee_key")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Committee key already exists." }, { status: 409 });
    }
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Committee not found." }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ committee: data });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const { committeeId } = await params;
  if (!committeeId) {
    return NextResponse.json({ error: "Committee id is required." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("committees")
    .delete()
    .eq("id", committeeId);

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json({ error: "Committee is in use and cannot be deleted." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

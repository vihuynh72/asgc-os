import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFullAdmin } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  let userId: string;
  try {
    const body = BodySchema.parse(await request.json());
    userId = body.userId;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: factors, error: listErr } = await admin.auth.admin.mfa.listFactors({ userId });
  if (listErr) {
    console.error("[admin:mfa-reset] listFactors failed", { message: listErr.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const ids = Array.isArray(factors?.factors)
    ? factors.factors
        .map((f) => (typeof f?.id === "string" ? f.id : ""))
        .filter(Boolean)
    : [];

  for (const id of ids) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ userId, id });
    if (error) {
      console.error("[admin:mfa-reset] deleteFactor failed", { message: error.message, id });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, deleted: ids.length });
}


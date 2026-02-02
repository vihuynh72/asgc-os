import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const MFA_RECOVERY_COOKIE = "asgc.mfaRecovery";

export async function POST(request: NextRequest) {
  const hasRecoveryCookie = request.cookies.get(MFA_RECOVERY_COOKIE)?.value === "1";
  if (!hasRecoveryCookie) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const env = getPublicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op.
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Admin recovery should be handled through an operator.
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (isAdmin) {
    return NextResponse.json({ ok: false, reason: "admin_recovery_requires_operator" }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();

  const { data: factors, error: listErr } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  if (listErr) {
    console.error("[mfa-recovery] listFactors failed", { message: listErr.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const ids = Array.isArray(factors?.factors)
    ? factors.factors
        .map((f) => (typeof f?.id === "string" ? f.id : ""))
        .filter(Boolean)
    : [];

  for (const id of ids) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id });
    if (error) {
      console.error("[mfa-recovery] deleteFactor failed", { message: error.message, id });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(MFA_RECOVERY_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}


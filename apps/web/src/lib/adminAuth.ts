import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { canAccessOfficeHoursAdmin } from "@/lib/office-hours-authz.mjs";

/**
 * Admin access tiers:
 * - 'full': Advisor or President - full admin access
 * - 'partial': Executive with full access_level - can manage meetings, shifts, requirements
 * - 'read-only': Executive in training mode - view only
 * - null: No admin access
 */
export type AdminTier = "full" | "partial" | "read-only" | null;

export interface AdminTierInfo {
  tier: AdminTier;
  isEvp: boolean;
  displayTitle: string | null;
}

export interface AdminAuthResult {
  ok: true;
  userId: string;
  tierInfo: AdminTierInfo;
}

export interface AdminAuthFailure {
  ok: false;
  response: NextResponse;
}

async function requireMfaAal2(
  supabase: ReturnType<typeof createServerClient>,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const currentLevel = (data?.currentLevel as string | undefined) ?? null;
    if (error || currentLevel !== "aal2") {
      return { ok: false, response: NextResponse.json({ error: "mfa_required" }, { status: 401 }) };
    }
    return { ok: true };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "mfa_required" }, { status: 401 }) };
  }
}

/**
 * Get admin tier info for a request. Returns user info if authenticated with any admin tier.
 * Use this for routes that allow partial/read-only access.
 */
export async function getAdminTierForRequest(
  request: NextRequest,
): Promise<AdminAuthResult | AdminAuthFailure> {
  const env = getPublicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op for route handlers that don't need to persist cookies
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const mfa = await requireMfaAal2(supabase);
  if (!mfa.ok) return mfa;

  const { data: tierData, error: tierErr } = await supabase.rpc("get_admin_tier", { _uid: user.id });

  if (tierErr) {
    console.error("get_admin_tier error:", tierErr);
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  const tier = (tierData?.tier as AdminTier) ?? null;

  if (!tier) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return {
    ok: true,
    userId: user.id,
    tierInfo: {
      tier,
      isEvp: tierData?.is_evp ?? false,
      displayTitle: tierData?.display_title ?? null,
    },
  };
}

/**
 * Require full admin access (Advisor or President only).
 * Use for sensitive operations: invites, roles, terms, blocklist.
 */
export async function requireFullAdmin(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | AdminAuthFailure> {
  const result = await getAdminTierForRequest(request);

  if (!result.ok) {
    return result;
  }

  if (result.tierInfo.tier !== "full") {
    return { ok: false, response: NextResponse.json({ error: "forbidden", reason: "full_admin_required" }, { status: 403 }) };
  }

  return { ok: true, userId: result.userId };
}

/**
 * Require full admin OR EVP access.
 * Use for office config (geofence, quiet hours).
 */
export async function requireFullAdminOrEvp(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | AdminAuthFailure> {
  const result = await getAdminTierForRequest(request);

  if (!result.ok) {
    return result;
  }

  if (result.tierInfo.tier !== "full" && !result.tierInfo.isEvp) {
    return { ok: false, response: NextResponse.json({ error: "forbidden", reason: "full_admin_or_evp_required" }, { status: 403 }) };
  }

  // EVP with read-only access still can't write
  if (result.tierInfo.tier === "read-only") {
    return { ok: false, response: NextResponse.json({ error: "forbidden", reason: "read_only_mode" }, { status: 403 }) };
  }

  return { ok: true, userId: result.userId };
}

/**
 * Require Office Hours admin access for routes in the Office Hours admin domain.
 * Only full admins and EVP partial admins are allowed.
 */
export async function requireOfficeHoursAdmin(
  request: NextRequest,
): Promise<AdminAuthResult | AdminAuthFailure> {
  const result = await getAdminTierForRequest(request);

  if (!result.ok) {
    return result;
  }

  if (!canAccessOfficeHoursAdmin(result.tierInfo)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden", reason: "office_hours_admin_required" }, { status: 403 }),
    };
  }

  return result;
}

/**
 * Require partial admin access (Executive or higher) with write permissions.
 * Use for meetings, shifts, office hour requirements.
 */
export async function requirePartialAdmin(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | AdminAuthFailure> {
  const result = await getAdminTierForRequest(request);

  if (!result.ok) {
    return result;
  }

  // read-only users cannot perform writes
  if (result.tierInfo.tier === "read-only") {
    return { ok: false, response: NextResponse.json({ error: "forbidden", reason: "read_only_mode" }, { status: 403 }) };
  }

  return { ok: true, userId: result.userId };
}

/**
 * Require any admin access (including read-only) for read operations.
 * Use for GET endpoints that execs should be able to view.
 */
export async function requireAnyAdminRead(
  request: NextRequest,
): Promise<AdminAuthResult | AdminAuthFailure> {
  return getAdminTierForRequest(request);
}

/**
 * Legacy helper for backward compatibility.
 * Maps to requireFullAdmin for routes that haven't been updated yet.
 * @deprecated Use requireFullAdmin, requirePartialAdmin, or requireAnyAdminRead instead.
 */
export async function isAdminForRequest(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | AdminAuthFailure> {
  return requireFullAdmin(request);
}

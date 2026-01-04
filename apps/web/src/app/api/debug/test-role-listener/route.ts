import { NextResponse, type NextRequest } from "next/server";

import { requireFullAdmin } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

/**
 * GET /api/debug/test-role-listener
 * Returns current user's roles_updated_at and tests the trigger
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const supabase = await getSupabaseRouteHandlerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();

  // Get current roles_updated_at
  const { data: profile, error: profileErr } = await admin
    .from("profile_private")
    .select("roles_updated_at")
    .eq("id", user.id)
    .maybeSingle();

  // Get ALL user's roles (not just active)
  const { data: allRoles, error: allRolesErr } = await admin
    .from("role_assignments")
    .select("id, role_key, term_id, starts_at, ends_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Get current term
  const { data: currentTerm } = await admin
    .from("terms")
    .select("id, name")
    .eq("is_current", true)
    .maybeSingle();

  return NextResponse.json({
    user_id: user.id,
    email: user.email,
    roles_updated_at: profile?.roles_updated_at,
    profile_error: profileErr?.message,
    current_term: currentTerm,
    all_roles: allRoles,
    active_roles: allRoles?.filter(r => r.ends_at == null), // use == for null check
    roles_error: allRolesErr?.message,
  });
}

/**
 * POST /api/debug/test-role-listener
 * Triggers a role change to test the listener
 * Body: { action: "touch" } - just updates roles_updated_at
 * Body: { action: "grant", roleKey: "volunteer" } - grants a role
 * Body: { action: "revoke" } - revokes all active roles
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const supabase = await getSupabaseRouteHandlerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const admin = getSupabaseAdminClient();

  if (body.action === "touch") {
    // Directly update roles_updated_at to simulate a role change
    const { error } = await admin
      .from("profile_private")
      .update({ roles_updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: "roles_updated_at touched - modal should appear within 5 seconds" 
    });
  }

  if (body.action === "grant") {
    // Get current term
    const { data: currentTerm } = await admin
      .from("terms")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();

    if (!currentTerm) {
      return NextResponse.json({ error: "No current term found" }, { status: 400 });
    }

    const roleKey = body.roleKey || "volunteer";

    // Insert a role
    const { data: inserted, error } = await admin
      .from("role_assignments")
      .insert({
        user_id: user.id,
        role_key: roleKey,
        term_id: currentTerm.id,
        starts_at: new Date().toISOString(),
        ends_at: null,
        is_primary: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: `Role ${roleKey} granted - trigger should update roles_updated_at`,
      inserted,
    });
  }

  if (body.action === "revoke") {
    // Revoke all active roles
    const { data: updated, error } = await admin
      .from("role_assignments")
      .update({ ends_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("ends_at", null)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: `${updated?.length || 0} roles revoked - trigger should update roles_updated_at`,
      updated,
    });
  }

  return NextResponse.json({ error: "Unknown action. Use: touch, grant, revoke" }, { status: 400 });
}

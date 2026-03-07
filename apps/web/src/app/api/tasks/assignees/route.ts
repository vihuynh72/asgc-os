import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op.
      },
    },
  });
}

const QuerySchema = z.object({
  committeeId: z.string().uuid(),
});

type Assignee = {
  id: string;
  display_name: string | null;
  role_key: string;
};

function roleRank(roleKey: string): number {
  switch (roleKey) {
    case "advisor":
      return 0;
    case "president":
      return 1;
    case "executive":
      return 2;
    case "board_member":
      return 3;
    case "volunteer":
      return 4;
    default:
      return 9;
  }
}

function canDelegateTo(actorRole: string, targetRole: string): boolean {
  if (actorRole === "advisor" || actorRole === "president") return true;
  if (actorRole === "executive") return ["board_member", "volunteer"].includes(targetRole);
  return false;
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { committeeId } = parsed.data;
  const supabase = getSupabaseForRequest(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [{ data: isAdminData, error: isAdminErr }, { data: isMemberData, error: isMemberErr }] = await Promise.all([
    supabase.rpc("is_admin", { _uid: user.id }),
    supabase.rpc("is_committee_member", { _committee_id: committeeId }),
  ]);

  if (isAdminErr) return NextResponse.json({ error: isAdminErr.message }, { status: 500 });
  if (isMemberErr) return NextResponse.json({ error: isMemberErr.message }, { status: 500 });

  const isAdmin = !!isAdminData;
  const isMember = !!isMemberData;

  if (!isAdmin && !isMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();

  const { data: memberships, error: membershipsErr } = await admin
    .from("committee_memberships")
    .select("user_id")
    .eq("committee_id", committeeId);

  if (membershipsErr) {
    return NextResponse.json({ error: membershipsErr.message }, { status: 500 });
  }

  const memberIds = Array.from(
    new Set(
      (memberships ?? [])
        .map((m) => (m as { user_id: string | null }).user_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );

  if (memberIds.length === 0) {
    return NextResponse.json({ assignees: [] satisfies Assignee[] });
  }

  const [{ data: profiles, error: profilesErr }, { data: terms }, { data: assignments, error: assignmentsErr }] =
    await Promise.all([
      admin.from("profiles").select("id,display_name,status").in("id", memberIds).eq("status", "active"),
      admin.from("terms").select("id").eq("is_current", true).limit(1),
      admin
        .from("role_assignments")
        .select("user_id,role_key,term_id,is_primary,ends_at")
        .in("user_id", memberIds)
        .is("ends_at", null),
    ]);

  if (profilesErr) {
    return NextResponse.json({ error: profilesErr.message }, { status: 500 });
  }

  if (assignmentsErr) {
    return NextResponse.json({ error: assignmentsErr.message }, { status: 500 });
  }

  const currentTermId = (terms ?? [])[0]?.id ?? null;

  const assignmentsByUser = new Map<string, Array<{ role_key: string; term_id: string | null; is_primary: boolean }>>();
  for (const a of (assignments ?? []) as Array<{ user_id: string; role_key: string; term_id: string | null; is_primary: boolean }>) {
    if (!assignmentsByUser.has(a.user_id)) assignmentsByUser.set(a.user_id, []);
    assignmentsByUser.get(a.user_id)!.push({ role_key: a.role_key, term_id: a.term_id, is_primary: a.is_primary });
  }

  function primaryRoleForUser(uid: string): string {
    const rows = assignmentsByUser.get(uid) ?? [];

    const hasAdvisor = rows.some((r) => r.term_id === null && r.role_key === "advisor");
    if (hasAdvisor) return "advisor";

    const termRows = rows.filter((r) => r.term_id && currentTermId && r.term_id === currentTermId);
    const eligible = termRows.filter((r) =>
      ["president", "executive", "board_member", "volunteer"].includes(r.role_key),
    );

    if (eligible.length === 0) return "volunteer";

    eligible.sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return roleRank(a.role_key) - roleRank(b.role_key);
    });

    return eligible[0]!.role_key;
  }

  const actorRole = isAdmin ? "president" : primaryRoleForUser(user.id);

  const out: Assignee[] = (profiles ?? []).map((p) => {
    const row = p as { id: string; display_name: string | null };
    return {
      id: row.id,
      display_name: row.display_name,
      role_key: primaryRoleForUser(row.id),
    };
  });

  const filtered = out
    .filter((a) => a.id === user.id || isAdmin || canDelegateTo(actorRole, a.role_key))
    .sort((a, b) => {
      if (a.id === user.id) return -1;
      if (b.id === user.id) return 1;
      const ra = roleRank(a.role_key);
      const rb = roleRank(b.role_key);
      if (ra !== rb) return ra - rb;
      return (a.display_name ?? a.id).localeCompare(b.display_name ?? b.id);
    });

  return NextResponse.json({ assignees: filtered });
}

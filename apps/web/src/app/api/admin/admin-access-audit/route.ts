import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function isAdminForRequest(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const env = getPublicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}

type AssignmentRow = {
  id: string;
  user_id: string;
  role_key: "advisor" | "president";
  term_id: string | null;
  starts_at: string;
  is_primary: boolean;
};

type TermRow = {
  id: string;
  name: string;
  is_current: boolean;
};

type UserRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type AuditRow = {
  assignment_id: string;
  user_id: string;
  role_key: "advisor" | "president";
  term_id: string | null;
  term_label: string | null;
  display_name: string | null;
  email: string | null;
};

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const admin = getSupabaseAdminClient();

  const { data: terms, error: termsErr } = await admin
    .from("terms")
    .select("id,name,is_current")
    .order("created_at", { ascending: false });

  if (termsErr) {
    return NextResponse.json({ error: termsErr.message }, { status: 500 });
  }

  const termRows = (terms ?? []) as TermRow[];
  const currentTerm = termRows.find((t) => t.is_current) ?? null;
  const termLabelById = new Map<string, string>();
  for (const t of termRows) {
    termLabelById.set(t.id, `${t.name}${t.is_current ? " (current)" : ""}`);
  }

  const { data: assignments, error: assignmentsErr } = await admin
    .from("role_assignments")
    .select("id,user_id,role_key,term_id,starts_at,is_primary")
    .is("ends_at", null)
    .in("role_key", ["advisor", "president"])
    .order("starts_at", { ascending: false });

  if (assignmentsErr) {
    return NextResponse.json({ error: assignmentsErr.message }, { status: 500 });
  }

  const safeAssignments = (assignments ?? []) as AssignmentRow[];
  const userIds = Array.from(new Set(safeAssignments.map((a) => a.user_id)));
  const userMap = new Map<string, UserRow>();

  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("profiles")
      .select("id,display_name,profile_private(email)")
      .in("id", userIds);

    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    const users =
      usersRaw?.map((row) => {
        const maybePrivate = (row as unknown as { profile_private?: { email?: string | null } | null }).profile_private;
        return {
          id: (row as unknown as { id: string }).id,
          display_name: (row as unknown as { display_name: string | null }).display_name ?? null,
          email: maybePrivate?.email ?? null,
        };
      }) ?? [];

    for (const u of users) {
      userMap.set(u.id, u);
    }
  }

  const adminAssignments: AuditRow[] = [];
  const nonCurrentPresidents: AuditRow[] = [];
  const invalidAssignments: AuditRow[] = [];

  for (const assignment of safeAssignments) {
    const user = userMap.get(assignment.user_id) ?? null;
    const termLabel = assignment.term_id ? termLabelById.get(assignment.term_id) ?? assignment.term_id : null;

    const row: AuditRow = {
      assignment_id: assignment.id,
      user_id: assignment.user_id,
      role_key: assignment.role_key,
      term_id: assignment.term_id,
      term_label: termLabel,
      display_name: user?.display_name ?? null,
      email: user?.email ?? null,
    };

    if (assignment.role_key === "advisor") {
      if (assignment.term_id) {
        invalidAssignments.push(row);
      } else {
        adminAssignments.push(row);
      }
      continue;
    }

    if (assignment.role_key === "president") {
      if (!assignment.term_id) {
        invalidAssignments.push(row);
        continue;
      }

      if (currentTerm && assignment.term_id === currentTerm.id) {
        adminAssignments.push(row);
      } else {
        nonCurrentPresidents.push(row);
      }
    }
  }

  return NextResponse.json({
    current_term: currentTerm ? { id: currentTerm.id, name: currentTerm.name } : null,
    admin_assignments: adminAssignments,
    non_current_presidents: nonCurrentPresidents,
    invalid_assignments: invalidAssignments,
  });
}

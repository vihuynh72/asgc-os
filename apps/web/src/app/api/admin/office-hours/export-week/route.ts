import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";

export const runtime = "nodejs";

const WeekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function mitigateCsvFormulaInjection(raw: string): string {
  // Spreadsheet programs may interpret cells starting with these characters as formulas.
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
}

type AdminWeeklyHoursRow = {
  user_id: string;
  week_start: string;
  total_minutes: number;
  in_office_minutes: number;
  deficit_minutes: number;
  deficit_in_office_minutes: number;
  needs_review_sessions: number;
};

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const s = mitigateCsvFormulaInjection(raw);
  if (/[\n\r,\"]/g.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function isAdminForRequest(
  request: NextRequest,
): Promise<
  | { ok: true; userId: string; supabase: ReturnType<typeof createServerClient> }
  | { ok: false; response: NextResponse }
> {
  const env = getPublicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op: admin endpoints don't need to refresh auth cookies.
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

  return { ok: true, userId: user.id, supabase };
}

export async function GET(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const weekStart = request.nextUrl.searchParams.get("weekStart");
  const weekStartParam =
    weekStart && weekStart.length > 0
      ? (() => {
          const parsed = WeekStartSchema.safeParse(weekStart);
          if (!parsed.success) return null;
          return parsed.data;
        })()
      : null;

  if (weekStart && weekStart.length > 0 && !weekStartParam) {
    return NextResponse.json({ error: "invalid weekStart" }, { status: 400 });
  }

  const { data: rows, error } = await authz.supabase.rpc("admin_weekly_hours", { _week_start: weekStartParam });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const typedRows = (rows ?? []) as AdminWeeklyHoursRow[];
  const userIds = typedRows.map((r) => r.user_id);

  const [{ data: profiles }, { data: privates }] = await Promise.all([
    authz.supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    authz.supabase
      .from("profile_private")
      .select("id,email")
      .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);

  const displayNameById = new Map<string, string>();
  for (const p of profiles ?? []) {
    const row = p as { id: string; display_name: string | null };
    displayNameById.set(row.id, row.display_name ?? "");
  }

  const emailById = new Map<string, string>();
  for (const p of privates ?? []) {
    const row = p as { id: string; email: string | null };
    emailById.set(row.id, row.email ?? "");
  }

  const header = [
    "week_start",
    "user_id",
    "display_name",
    "email",
    "total_minutes",
    "in_office_minutes",
    "deficit_minutes",
    "deficit_in_office_minutes",
    "needs_review_sessions",
  ];

  const lines: string[] = [];
  lines.push(header.join(","));

  for (const r of typedRows) {
    lines.push(
      [
        r.week_start,
        r.user_id,
        displayNameById.get(r.user_id) ?? "",
        emailById.get(r.user_id) ?? "",
        r.total_minutes,
        r.in_office_minutes,
        r.deficit_minutes,
        r.deficit_in_office_minutes,
        r.needs_review_sessions,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const csv = lines.join("\n") + "\n";
  const filenameWeek = (typedRows[0]?.week_start || weekStartParam || "week").replace(/[^0-9-]/g, "");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=office-hours-${filenameWeek}.csv`,
    },
  });
}

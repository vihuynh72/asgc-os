import { NextResponse, type NextRequest } from "next/server";

import { normalizeDateOnlyString } from "@/lib/dateOnly";
import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function mitigateCsvFormulaInjection(raw: string): string {
  // Spreadsheet programs may interpret cells starting with these characters as formulas.
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
}

type AdminWeeklyHoursRow = {
  user_id: string;
  week_start: string;
  role_key: string | null;
  required_total_minutes: number | string;
  total_minutes: number | string;
  deficit_minutes: number | string;
};

type AdminWeeklyHoursPreviewRow = {
  user_id: string;
  week_start: string;
  role: string;
  name: string;
  total_hours: number;
  required_hours: number;
  missing_hours: number;
  // Kept for admin actions (copy emails), but not displayed in the UI by default.
  email: string;
};

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const s = mitigateCsvFormulaInjection(raw);
  if (/[\n\r,\"]/g.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function roundHours(minutes: number | string | null | undefined): number {
  const n = typeof minutes === "number" ? minutes : typeof minutes === "string" ? Number(minutes) : NaN;
  const m = Number.isFinite(n) ? n : 0;
  return Math.round((m / 60) * 100) / 100;
}

function inferRoleLabel(email: string, roleKey: string | null): string {
  const local = (email.split("@")[0] ?? "").toLowerCase();

  if (roleKey === "president" || local.includes("president")) return "President";

  if (roleKey === "executive") {
    if (local.includes("vpfinance")) return "Vice President of Finance";
    if (local.includes("vp")) return "Vice President";
    return "Executive";
  }

  if (roleKey === "director") return "Director";

  if (roleKey === "board_member") {
    const m = local.match(/boardmember(\d{1,2})/);
    if (m?.[1]) return `Board Member ${m[1]}`;
    return "Board Member";
  }

  return roleKey ? roleKey.replace(/_/g, " ") : "Member";
}

function roleRank(role: string): number {
  const r = role.toLowerCase();
  if (r.includes("president")) return 0;
  if (r.includes("vice president") || r.includes("executive")) return 1;
  if (r.includes("director")) return 2;
  if (r.includes("board member")) return 3;
  return 9;
}

function boardNumber(role: string): number | null {
  const m = role.match(/board member\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

export async function GET(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const supabase = await getSupabaseRouteHandlerClient();

  const formatParamRaw = request.nextUrl.searchParams.get("format");
  const formatParam = formatParamRaw === null || formatParamRaw === "csv" || formatParamRaw === "json" ? formatParamRaw : null;
  if (formatParamRaw !== null && !formatParam) {
    return NextResponse.json({ error: "invalid format" }, { status: 400 });
  }

  const dispositionRaw = request.nextUrl.searchParams.get("disposition");
  const disposition = dispositionRaw === null || dispositionRaw === "attachment" || dispositionRaw === "inline" ? dispositionRaw : null;
  if (dispositionRaw !== null && !disposition) {
    return NextResponse.json({ error: "invalid disposition" }, { status: 400 });
  }

  const weekStartRaw = request.nextUrl.searchParams.get("weekStart");
  const weekStartParam = weekStartRaw ? normalizeDateOnlyString(weekStartRaw) : null;
  if (weekStartRaw && !weekStartParam) {
    return NextResponse.json({ error: "invalid_weekStart" }, { status: 400 });
  }

  const { data: rows, error } = await supabase.rpc("admin_weekly_hours", { _week_start: weekStartParam });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const typedRows = (rows ?? []) as AdminWeeklyHoursRow[];
  const userIds = typedRows.map((r) => r.user_id);

  const admin = getSupabaseAdminClient();
  const [{ data: profiles }, { data: privates }] = await Promise.all([
    admin
      .from("profiles")
      .select("id,display_name")
      .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
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

  const filenameWeek = (typedRows[0]?.week_start || weekStartParam || "week").replace(/[^0-9-]/g, "");

  const reportRows: AdminWeeklyHoursPreviewRow[] = typedRows.map((r) => {
    const email = emailById.get(r.user_id) ?? "";
    const requiredHours = roundHours(r.required_total_minutes ?? 0);
    const totalHours = roundHours(r.total_minutes ?? 0);
    const missingHours = roundHours(r.deficit_minutes ?? 0);
    return {
      user_id: r.user_id,
      week_start: r.week_start,
      role: inferRoleLabel(email, r.role_key ?? null),
      name: displayNameById.get(r.user_id) ?? "",
      required_hours: requiredHours,
      total_hours: totalHours,
      missing_hours: missingHours,
      email,
    };
  });

  reportRows.sort((a, b) => {
    const ar = roleRank(a.role);
    const br = roleRank(b.role);
    if (ar !== br) return ar - br;
    const ab = boardNumber(a.role);
    const bb = boardNumber(b.role);
    if (ab !== null && bb !== null && ab !== bb) return ab - bb;
    if (ab !== null && bb === null) return -1;
    if (ab === null && bb !== null) return 1;
    if (a.missing_hours !== b.missing_hours) return b.missing_hours - a.missing_hours;
    return (a.name || a.email).toLowerCase().localeCompare((b.name || b.email).toLowerCase());
  });

  if (formatParam === "json") {
    return NextResponse.json({ weekStart: filenameWeek, rows: reportRows }, { status: 200 });
  }

  const header = [
    "week_start",
    "role",
    "name",
    "required_hours",
    "total_hours",
    "missing_hours",
  ];

  const lines: string[] = [];
  lines.push(header.join(","));

  for (const r of reportRows) {
    lines.push(
      [
        r.week_start,
        r.role,
        r.name,
        r.required_hours,
        r.total_hours,
        r.missing_hours,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const csv = lines.join("\n") + "\n";
  const contentDisposition = disposition === "inline" ? "inline" : "attachment";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `${contentDisposition}; filename=office-hours-${filenameWeek}.csv`,
    },
  });
}

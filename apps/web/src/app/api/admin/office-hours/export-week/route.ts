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
  total_minutes: number;
  in_office_minutes: number;
  deficit_minutes: number;
  deficit_in_office_minutes: number;
};

type AdminWeeklyHoursPreviewRow = {
  user_id: string;
  week_start: string;
  display_name: string;
  email: string;
  total_minutes: number;
  in_office_minutes: number;
  deficit_minutes: number;
  deficit_in_office_minutes: number;
};

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const s = mitigateCsvFormulaInjection(raw);
  if (/[\n\r,\"]/g.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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

  if (formatParam === "json") {
    const previewRows: AdminWeeklyHoursPreviewRow[] = typedRows.map((r) => ({
      user_id: r.user_id,
      week_start: r.week_start,
      display_name: displayNameById.get(r.user_id) ?? "",
      email: emailById.get(r.user_id) ?? "",
      total_minutes: r.total_minutes,
      in_office_minutes: r.in_office_minutes,
      deficit_minutes: r.deficit_minutes,
      deficit_in_office_minutes: r.deficit_in_office_minutes,
    }));

    return NextResponse.json({ weekStart: filenameWeek, rows: previewRows }, { status: 200 });
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

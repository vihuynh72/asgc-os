import { NextResponse, type NextRequest } from "next/server";

import { normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import {
  completionPercent,
  csvEscape,
  deriveRosterStatus,
  inferRoleLabel,
  reportStatus,
  reportStatusLabel,
  rosterStatusLabel,
  roleGroupLabel,
  roleKeyRank,
  sortWeeklyReportRows,
} from "@/lib/office-hours-weekly-report.mjs";

export const runtime = "nodejs";

type AdminWeeklyHoursRow = {
  user_id: string;
  week_start: string;
  role_key: string | null;
  required_total_minutes: number | string;
  total_minutes: number | string;
  deficit_minutes: number | string;
  needs_review_sessions?: number | string | null;
};

type AdminWeeklyHoursPreviewRow = {
  user_id: string;
  week_start: string;
  role_key: string | null;
  role: string;
  name: string;
  total_hours: number;
  required_hours: number;
  missing_hours: number;
  needs_review_sessions: number;
  member_status: "assigned" | "vacant" | "no_show";
  // Kept for admin actions (copy emails), but not displayed in the UI by default.
  email: string;
};

type BootstrapRoleGrantRow = {
  id: string;
  email: string;
  email_normalized: string;
  role_key: string;
  term_id: string | null;
  notes: string | null;
  created_at: string;
};

type InviteAllowlistRow = {
  email_normalized: string;
  notes: string | null;
};

type OfficeHourRequirementRow = {
  role_key: string;
  term_id: string | null;
  weekly_total_hours: number | string | null;
  effective_start: string | null;
  effective_end: string | null;
  created_at: string;
};

const REPORT_ROLE_KEYS = ["president", "executive", "director", "board_member", "volunteer"] as const;

function toFiniteNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundHours(minutes: number | string | null | undefined): number {
  return Math.round((toFiniteNumber(minutes) / 60) * 100) / 100;
}

function formatHoursCsv(hours: number | string | null | undefined): string {
  return (Math.round(toFiniteNumber(hours) * 100) / 100).toFixed(2);
}

function formatPercentCsv(unit: number): string {
  return `${(Math.round(Math.max(0, Math.min(1, unit)) * 1000) / 10).toFixed(1)}%`;
}

function rosterFlag(status: "assigned" | "vacant" | "no_show"): string {
  if (status === "vacant") return "⚪ Vacant";
  if (status === "no_show") return "🛑 No show";
  return "🟢 Assigned";
}

function hoursFlag(statusKey: ReturnType<typeof reportStatus>): string {
  if (statusKey === "complete") return "✅ Complete";
  if (statusKey === "behind") return "🟠 Behind";
  if (statusKey === "missing") return "❌ Missing";
  return "⚪ Not required";
}

function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function isExactEmail(value: string): boolean {
  return value.includes("@") && !value.startsWith("@");
}

function normalizeName(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

function isPreferredGrant(
  candidate: Pick<BootstrapRoleGrantRow, "term_id" | "role_key" | "created_at">,
  existing: Pick<BootstrapRoleGrantRow, "term_id" | "role_key" | "created_at">,
  currentTermId: string | null,
): boolean {
  const termRank = (termId: string | null) => {
    if (currentTermId && termId === currentTermId) return 0;
    if (termId === null) return 1;
    return 2;
  };

  const candidateTermRank = termRank(candidate.term_id);
  const existingTermRank = termRank(existing.term_id);
  if (candidateTermRank !== existingTermRank) return candidateTermRank < existingTermRank;

  const candidateRoleRank = roleKeyRank(candidate.role_key ?? null);
  const existingRoleRank = roleKeyRank(existing.role_key ?? null);
  if (candidateRoleRank !== existingRoleRank) return candidateRoleRank < existingRoleRank;

  return (candidate.created_at ?? "").localeCompare(existing.created_at ?? "") > 0;
}

function resolveRequiredMinutesByRole(
  rows: OfficeHourRequirementRow[],
  weekStart: string,
  currentTermId: string | null,
): Map<string, number> {
  const byRole = new Map<string, OfficeHourRequirementRow[]>();

  for (const row of rows) {
    if (!row?.role_key) continue;
    if (row.effective_start && row.effective_start > weekStart) continue;
    if (row.effective_end && row.effective_end < weekStart) continue;

    const list = byRole.get(row.role_key) ?? [];
    list.push(row);
    byRole.set(row.role_key, list);
  }

  const requiredMinutesByRole = new Map<string, number>();

  for (const [roleKey, list] of byRole.entries()) {
    const sorted = [...list].sort((a, b) => {
      const termRank = (termId: string | null) => {
        if (currentTermId && termId === currentTermId) return 0;
        if (termId === null) return 1;
        return 2;
      };

      const aTermRank = termRank(a.term_id);
      const bTermRank = termRank(b.term_id);
      if (aTermRank !== bTermRank) return aTermRank - bTermRank;

      if (a.effective_start !== b.effective_start) {
        if (a.effective_start === null) return 1;
        if (b.effective_start === null) return -1;
        return b.effective_start.localeCompare(a.effective_start);
      }

      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });

    const selected = sorted[0];
    const weeklyHours = Math.max(0, toFiniteNumber(selected?.weekly_total_hours ?? 0));
    requiredMinutesByRole.set(roleKey, Math.round(weeklyHours * 60));
  }

  return requiredMinutesByRole;
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
  const weekStartResolved =
    typedRows[0]?.week_start ?? weekStartParam ?? startOfWeekMondayDateOnly(todayDateString()) ?? todayDateString();
  const filenameWeek = weekStartResolved.replace(/[^0-9-]/g, "");
  const userIds = Array.from(new Set(typedRows.map((r) => r.user_id).filter((id) => typeof id === "string" && id.length > 0)));

  const admin = getSupabaseAdminClient();
  const [
    { data: currentTermRow, error: currentTermErr },
    { data: pendingGrantsRaw, error: pendingGrantsErr },
  ] = await Promise.all([
    admin.from("terms").select("id").eq("is_current", true).limit(1).maybeSingle(),
    admin
      .from("bootstrap_role_grants")
      .select("id,email,email_normalized,role_key,term_id,notes,created_at")
      .eq("is_active", true)
      .is("consumed_at", null)
      .in("role_key", [...REPORT_ROLE_KEYS])
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  if (currentTermErr || pendingGrantsErr) {
    return NextResponse.json({ error: currentTermErr?.message || pendingGrantsErr?.message || "lookup_failed" }, { status: 500 });
  }

  const currentTermId = currentTermRow?.id ?? null;

  let profiles: Array<{ id: string; display_name: string | null }> = [];
  let privates: Array<{ id: string; email: string | null }> = [];

  if (userIds.length > 0) {
    const [{ data: profilesRaw, error: profilesErr }, { data: privatesRaw, error: privatesErr }] = await Promise.all([
      admin.from("profiles").select("id,display_name").in("id", userIds),
      admin.from("profile_private").select("id,email").in("id", userIds),
    ]);

    if (profilesErr || privatesErr) {
      return NextResponse.json({ error: profilesErr?.message || privatesErr?.message || "lookup_failed" }, { status: 500 });
    }

    profiles = ((profilesRaw ?? []) as Array<{ id: string; display_name: string | null }>).filter(
      (row) => typeof row.id === "string" && row.id.length > 0,
    );
    privates = ((privatesRaw ?? []) as Array<{ id: string; email: string | null }>).filter(
      (row) => typeof row.id === "string" && row.id.length > 0,
    );
  }

  const displayNameById = new Map<string, string>();
  for (const row of profiles) {
    displayNameById.set(row.id, normalizeName(row.display_name));
  }

  const emailById = new Map<string, string>();
  for (const row of privates) {
    emailById.set(row.id, normalizeEmail(row.email));
  }

  const pendingGrants = (pendingGrantsRaw ?? []) as BootstrapRoleGrantRow[];

  const exactEmails = new Set<string>();
  for (const email of emailById.values()) {
    if (isExactEmail(email)) exactEmails.add(email);
  }
  for (const grant of pendingGrants) {
    const email = normalizeEmail(grant.email_normalized || grant.email);
    if (isExactEmail(email)) exactEmails.add(email);
  }

  let allowlistRows: InviteAllowlistRow[] = [];
  if (exactEmails.size > 0) {
    const { data: allowlistRaw, error: allowlistErr } = await admin
      .from("invites_allowlist")
      .select("email_normalized,notes")
      .in("email_normalized", [...exactEmails])
      .eq("is_active", true);

    if (allowlistErr) return NextResponse.json({ error: allowlistErr.message }, { status: 500 });
    allowlistRows = (allowlistRaw ?? []) as InviteAllowlistRow[];
  }

  const allowlistNameByEmail = new Map<string, string>();
  for (const row of allowlistRows) {
    const email = normalizeEmail(row.email_normalized);
    if (!isExactEmail(email)) continue;
    const notes = normalizeName(row.notes);
    if (!notes) continue;
    allowlistNameByEmail.set(email, notes);
  }

  const pendingRoleKeys = Array.from(
    new Set(
      pendingGrants
        .map((grant) => grant.role_key)
        .filter((roleKey): roleKey is string => typeof roleKey === "string" && roleKey.length > 0),
    ),
  );

  let requiredMinutesByRole = new Map<string, number>();
  if (pendingRoleKeys.length > 0) {
    let requirementsQuery = admin
      .from("office_hour_requirements")
      .select("role_key,term_id,weekly_total_hours,effective_start,effective_end,created_at")
      .in("role_key", pendingRoleKeys);

    if (currentTermId) {
      requirementsQuery = requirementsQuery.or(`term_id.is.null,term_id.eq.${currentTermId}`);
    } else {
      requirementsQuery = requirementsQuery.is("term_id", null);
    }

    const { data: requirementsRaw, error: requirementsErr } = await requirementsQuery;
    if (requirementsErr) return NextResponse.json({ error: requirementsErr.message }, { status: 500 });

    requiredMinutesByRole = resolveRequiredMinutesByRole(
      (requirementsRaw ?? []) as OfficeHourRequirementRow[],
      weekStartResolved,
      currentTermId,
    );
  }

  const reportRows: AdminWeeklyHoursPreviewRow[] = typedRows.map((r) => {
    const email = emailById.get(r.user_id) ?? "";
    const requiredHours = roundHours(r.required_total_minutes ?? 0);
    const totalHours = roundHours(r.total_minutes ?? 0);
    const missingHours = roundHours(r.deficit_minutes ?? 0);
    const needsReviewRaw = r.needs_review_sessions ?? 0;
    const needsReview =
      typeof needsReviewRaw === "number" ? needsReviewRaw : typeof needsReviewRaw === "string" ? Number(needsReviewRaw) : 0;
    const nameFromProfile = normalizeName(displayNameById.get(r.user_id));
    const nameFromAllowlist = isExactEmail(email) ? allowlistNameByEmail.get(email) ?? "" : "";
    const resolvedName = nameFromProfile || nameFromAllowlist;
    const memberStatus = deriveRosterStatus({
      name: resolvedName,
      required_hours: requiredHours,
      total_hours: totalHours,
    });
    const name = resolvedName || "Vacant";

    return {
      user_id: r.user_id,
      week_start: r.week_start,
      role_key: r.role_key ?? null,
      role: inferRoleLabel({ email, roleKey: r.role_key ?? null }),
      name,
      required_hours: requiredHours,
      total_hours: totalHours,
      missing_hours: missingHours,
      needs_review_sessions: Number.isFinite(needsReview) ? needsReview : 0,
      member_status: memberStatus,
      email,
    };
  });

  const existingEmails = new Set<string>(
    reportRows.map((row) => normalizeEmail(row.email)).filter((email) => isExactEmail(email)),
  );

  const pendingByEmail = new Map<string, BootstrapRoleGrantRow>();
  for (const grant of pendingGrants) {
    const email = normalizeEmail(grant.email_normalized || grant.email);
    if (!isExactEmail(email)) continue;
    if (grant.term_id && currentTermId && grant.term_id !== currentTermId) continue;

    const existingGrant = pendingByEmail.get(email);
    if (!existingGrant || isPreferredGrant(grant, existingGrant, currentTermId)) {
      pendingByEmail.set(email, grant);
    }
  }

  for (const [email, grant] of pendingByEmail.entries()) {
    if (existingEmails.has(email)) continue;

    const roleKey = grant.role_key ?? null;
    const requiredMinutes = roleKey ? requiredMinutesByRole.get(roleKey) ?? 0 : 0;
    const requiredHours = roundHours(requiredMinutes);
    const totalHours = 0;
    const missingHours = requiredHours;
    const resolvedName = normalizeName(grant.notes) || allowlistNameByEmail.get(email) || "";
    const memberStatus = deriveRosterStatus({
      name: resolvedName,
      required_hours: requiredHours,
      total_hours: totalHours,
    });
    const name = resolvedName || "Vacant";

    reportRows.push({
      user_id: `pending:${grant.id}`,
      week_start: weekStartResolved,
      role_key: roleKey,
      role: inferRoleLabel({ email, roleKey }),
      name,
      required_hours: requiredHours,
      total_hours: totalHours,
      missing_hours: missingHours,
      needs_review_sessions: 0,
      member_status: memberStatus,
      email,
    });
  }

  const sorted = sortWeeklyReportRows(reportRows);

  if (formatParam === "json") {
    return NextResponse.json({ weekStart: filenameWeek, rows: sorted }, { status: 200 });
  }

  const header = [
    "Week Start",
    "Group",
    "Role",
    "Member Name",
    "Email",
    "Roster Status",
    "Roster Flag",
    "Required Hours",
    "Completed Hours",
    "Missing Hours",
    "Completion Percent",
    "Status",
    "Hours Flag",
    "Needs Review Sessions",
  ];

  const lines: string[] = [];
  lines.push(header.join(","));

  for (const r of sorted) {
    const statusKey = reportStatus({
      required_hours: r.required_hours,
      total_hours: r.total_hours,
      missing_hours: r.missing_hours,
    });
    const completion = completionPercent({
      required_hours: r.required_hours,
      total_hours: r.total_hours,
    });

    lines.push(
      [
        r.week_start,
        roleGroupLabel(r.role_key ?? null),
        r.role,
        r.name,
        r.email,
        rosterStatusLabel(r.member_status),
        rosterFlag(r.member_status),
        formatHoursCsv(r.required_hours),
        formatHoursCsv(r.total_hours),
        formatHoursCsv(r.missing_hours),
        formatPercentCsv(completion),
        reportStatusLabel(statusKey),
        hoursFlag(statusKey),
        r.needs_review_sessions,
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const csv = `\uFEFF${lines.join("\n")}\n`;
  const contentDisposition = disposition === "inline" ? "inline" : "attachment";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `${contentDisposition}; filename=office-hours-${filenameWeek}.csv`,
    },
  });
}
